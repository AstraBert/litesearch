use std::collections::HashMap;
use std::path::Path;

use anyhow::{Result, anyhow};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use qdrant_edge::EdgeShard;
use qdrant_edge::segment::data_types::vectors::{VectorInternal, VectorStructInternal};
use qdrant_edge::segment::types::{
    Distance, ExtendedPointId, Payload, PayloadStorageType, SegmentConfig, VectorDataConfig,
    VectorStorageType,
};
use qdrant_edge::shard::operations::CollectionUpdateOperations;
use qdrant_edge::shard::operations::point_ops::{
    PointInsertOperationsInternal, PointOperations, PointStructPersisted,
};
use qdrant_edge::shard::query::query_enum::QueryEnum;
use qdrant_edge::shard::query::{ScoringQuery, ShardQueryRequest};
use qdrant_edge::shard::scroll::ScrollRequestInternal;
use serde_json::Value;

const EMBEDDINGS_DIMENSIONS: usize = 768;
const SHARD_DIR: &str = ".litesearch.qdrant";
const VECTOR_NAMESPACE: &str = "litesearch";
const SPARSE_VECTOR_NAMESPACE: &str = "litesparse";
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

struct EmbeddingWithPayload {
    embedding: Vec<f32>,
    payload: HashMap<String, Value>,
    id: u64,
}

impl FromNapiValue for EmbeddingWithPayload {
    unsafe fn from_napi_value(env: sys::napi_env, napi_val: sys::napi_value) -> napi::Result<Self> {
    }
}

#[napi]
pub fn upsert_dense_embeddings(embeddings: Vec<EmbeddingWithPayload>) -> Result<()> {
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
                embd.id,
                embd.embedding.clone(),
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
