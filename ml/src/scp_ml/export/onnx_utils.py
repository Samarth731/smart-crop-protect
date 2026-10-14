"""ONNX export helpers shared by every tabular model.

All exported graphs take one float32 tensor ``input`` of shape [N, F] and are verified
against the scikit-learn estimator before they are written, so a broken export can never
reach the web app.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnx import helper
from skl2onnx import to_onnx

OPSET = {"": 17, "ai.onnx.ml": 3}


def _convert(model, n_features: int, **options) -> onnx.ModelProto:
    sample = np.zeros((1, n_features), dtype=np.float32)
    return to_onnx(model, sample, target_opset=OPSET, options=options or None)


def save_quantile_stack(models: dict, n_features: int, path: Path, names: list[str],
                        output: str = "quantiles") -> Path:
    """Fuse several regressors that share one input into a single graph with output [N, k]."""
    graphs = [_convert(m, n_features).graph for m in models.values()]
    nodes, outputs, inits = [], [], []
    for g, name in zip(graphs, names, strict=True):
        rename = {g.input[0].name: "input"}
        for init in g.initializer:
            init.name = f"{name}_{init.name}"
            inits.append(init)
        for node in g.node:
            node.name = f"{name}_{node.name}"
            node.input[:] = [rename.get(i, f"{name}_{i}") for i in node.input]
            node.output[:] = [f"{name}_{o}" for o in node.output]
            nodes.append(node)
        outputs.append(f"{name}_{g.output[0].name}")
    nodes.append(helper.make_node("Concat", outputs, [output], axis=1, name="concat"))
    graph = helper.make_graph(
        nodes, "quantile_stack",
        [helper.make_tensor_value_info("input", onnx.TensorProto.FLOAT, [None, n_features])],
        [helper.make_tensor_value_info(output, onnx.TensorProto.FLOAT, [None, len(names)])],
        initializer=inits,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid(d, v) for d, v in OPSET.items()],
                              producer_name="smart-crop-protect")
    model.ir_version = 8
    onnx.checker.check_model(model)
    _verify_regressors(model, list(models.values()), n_features)
    path.write_bytes(model.SerializeToString())
    return path


def save_regressor(model, n_features: int, path: Path) -> Path:
    """Single regressor -> graph ``input`` [N, F] -> ``prediction`` [N, 1]."""
    return save_quantile_stack({0: model}, n_features, path, names=["gbm"], output="prediction")


def save_classifier(model, n_features: int, path: Path) -> Path:
    """Classifier -> graph with outputs ``label`` and ``probabilities`` [N, classes]."""
    onx = _convert(model, n_features, **{id(model): {"zipmap": False}})
    sess = ort.InferenceSession(onx.SerializeToString())
    X = np.random.default_rng(0).normal(size=(256, n_features)).astype(np.float32)
    proba = sess.run(None, {sess.get_inputs()[0].name: X})[1]
    np.testing.assert_allclose(proba, model.predict_proba(X), atol=1e-4)
    path.write_bytes(onx.SerializeToString())
    return path


def _verify_regressors(onx: onnx.ModelProto, models: list, n_features: int) -> None:
    sess = ort.InferenceSession(onx.SerializeToString())
    rng = np.random.default_rng(0)
    X = rng.normal(size=(512, n_features)).astype(np.float32)
    X[:, n_features // 2:] = rng.integers(0, 2, size=(512, n_features - n_features // 2))
    got = sess.run(None, {"input": X})[0]
    want = np.stack([m.predict(X) for m in models], axis=1)
    np.testing.assert_allclose(got, want, atol=1e-4)
