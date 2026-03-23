use std::collections::HashMap;
use std::path::Path;
use std::str::FromStr;

use anyhow::{Result, anyhow};
use napi_derive::napi;
use ordered_float::OrderedFloat;
use qdrant_edge::EdgeShard;
use qdrant_edge::segment::data_types::vectors::{NamedQuery, VectorInternal, VectorStructInternal};
use qdrant_edge::segment::json_path::JsonPath;
use qdrant_edge::segment::types::{
    AnyVariants, Condition, Distance, ExtendedPointId, FieldCondition, Filter, Match, Payload,
    PayloadStorageType, SegmentConfig, VectorDataConfig, VectorStorageType, WithPayloadInterface,
    WithVector,
};
use qdrant_edge::shard::operations::CollectionUpdateOperations;
use qdrant_edge::shard::operations::point_ops::{
    PointInsertOperationsInternal, PointOperations, PointStructPersisted,
};
use qdrant_edge::shard::query::query_enum::QueryEnum;
use qdrant_edge::shard::query::{ScoringQuery, ShardQueryRequest};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const EMBEDDINGS_DIMENSIONS: usize = 768;
const SHARD_DIR: &str = ".litesearch.qdrant";
const VECTOR_NAMESPACE: &str = "litesearch";
const BATCH_SIZE: usize = 1000;

fn load_qdrant_edge() -> Result<EdgeShard> {
    let path = Path::new(SHARD_DIR);
    let edge_config: Option<SegmentConfig> = if !path.exists() {
        std::fs::create_dir_all(&path)?;
        let mut vectors = HashMap::new();
        vectors.insert(
            VECTOR_NAMESPACE.to_string(),
            VectorDataConfig {
                size: EMBEDDINGS_DIMENSIONS,
                distance: Distance::Cosine,
                storage_type: VectorStorageType::ChunkedMmap,
                index: Default::default(),
                quantization_config: None,
                multivector_config: None,
                datatype: None,
            },
        );

        Some(SegmentConfig {
            vector_data: vectors,
            sparse_vector_data: HashMap::new(),
            payload_storage_type: PayloadStorageType::Mmap,
        })
    } else {
        None
    };

    let edge_shard = EdgeShard::load(&path, edge_config)?;

    Ok(edge_shard)
}

#[napi(object)]
#[derive(Debug, Serialize, Deserialize)]
pub struct EmbeddingPayload {
    pub document_path: String,
    pub start: u32,
    pub end: u32,
    pub content: String,
}

#[napi(object)]
pub struct EmbeddingWithPayload {
    pub embedding: Vec<f64>,
    pub payload: EmbeddingPayload,
    pub id: u32,
}

#[napi]
pub fn upsert_embeddings(embeddings: Vec<EmbeddingWithPayload>) -> Result<()> {
    if embeddings.is_empty() {
        return Ok(());
    }
    let edge = load_qdrant_edge()?;
    for chunk in embeddings.chunks(BATCH_SIZE) {
        let mut points: Vec<PointStructPersisted> = vec![];
        for embd in chunk {
            let payload_json =
                serde_json::to_value(&embd.payload).map_err(|e| anyhow!(e.to_string()))?;
            let point = make_point(
                u64::from(embd.id),
                convert_embedding(embd.embedding.clone()),
                payload_json,
                VECTOR_NAMESPACE,
            );
            points.push(point);
        }
        let operation = CollectionUpdateOperations::PointOperation(PointOperations::UpsertPoints(
            PointInsertOperationsInternal::PointsList(points),
        ));
        edge.update(operation).map_err(|e| anyhow!(e.to_string()))?;
    }

    Ok(())
}

#[napi(object)]
pub struct ResultWithScore {
    pub content: String,
    pub document_path: String,
    pub score: f64,
}

#[napi]
pub fn search(
    query_embedding: Vec<f64>,
    document_paths: Option<Vec<String>>,
    limit: Option<u32>,
    score_threshold: Option<f64>,
) -> Result<Vec<ResultWithScore>> {
    let edge_shard = load_qdrant_edge()?;
    let mut all_results: Vec<ResultWithScore> = vec![];
    let query: Vec<f32> = convert_embedding(query_embedding);
    let threshold: Option<OrderedFloat<f32>> = score_threshold.map(|t| OrderedFloat(t as f32));
    let top_k = match limit {
        Some(l) => l as usize,
        None => 10,
    };
    let stmt_filter = match document_paths {
        Some(d) => Some(Filter::new_must(Condition::Field(
            FieldCondition::new_match(
                JsonPath::from_str("document_path").map_err(|_| {
                    anyhow!("An error occurred while creating JSONPath from 'path'")
                })?,
                Match::from(AnyVariants::Strings(d.iter().cloned().collect())),
            ),
        ))),
        None => None,
    };
    let shard_query = ShardQueryRequest {
        prefetches: vec![],
        query: Some(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
            query: VectorInternal::Dense(query),
            using: Some(VECTOR_NAMESPACE.to_string()),
        }))),
        filter: stmt_filter,
        score_threshold: threshold,
        limit: top_k,
        offset: 0,
        params: None,
        with_vector: WithVector::Bool(false),
        with_payload: WithPayloadInterface::Bool(true),
    };
    let results = edge_shard
        .query(shard_query)
        .map_err(|e| anyhow!(e.to_string()))?;
    for r in results {
        let payload = match r.payload {
            Some(p) => p,
            None => return Err(anyhow!("Found a None payload when searching")),
        };
        let embd_payload = payload_to_struct(&payload)?;
        let scored_result = ResultWithScore {
            content: embd_payload.content,
            document_path: embd_payload.document_path,
            score: r.score as f64,
        };
        all_results.push(scored_result);
    }

    Ok(all_results)
}

fn convert_embedding(embd: Vec<f64>) -> Vec<f32> {
    let data: Vec<f32> = embd.iter().map(|f| *f as f32).collect();
    data
}

/// Create a point struct for upserting.
fn make_point(
    id: u64,
    vector: Vec<f32>,
    payload: Value,
    vector_name: &str,
) -> PointStructPersisted {
    let mut vectors = HashMap::new();
    vectors.insert(vector_name.to_string(), VectorInternal::from(vector));

    PointStructPersisted {
        id: ExtendedPointId::NumId(id),
        vector: VectorStructInternal::Named(vectors).into(),
        payload: Some(json_to_payload(payload)),
    }
}

/// Convert JSON value to Qdrant Payload.
fn json_to_payload(value: Value) -> Payload {
    if let Value::Object(map) = value {
        let mut payload = Payload::default();
        for (k, v) in map {
            payload.0.insert(k, v);
        }
        payload
    } else {
        Payload::default()
    }
}

/// Convert Qdrant Payload back to DocMeta
fn payload_to_struct(payload: &Payload) -> Result<EmbeddingPayload> {
    let json_map: serde_json::Map<String, Value> = payload
        .0
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    let json_value = Value::Object(json_map);
    serde_json::from_value(json_value).map_err(|e| anyhow!(e.to_string()))
}
