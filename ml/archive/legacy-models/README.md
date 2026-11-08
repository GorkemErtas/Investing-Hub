# Quarantined historical models

One copy of the six original ONNX files and their scaler/metadata JSON. Both old backend locations were byte-for-byte identical; `checksums.json` records SHA-256 and size before consolidation. Files are retained solely as historical research material: their training data, features, evaluation and provenance cannot be verified.

No application imports this directory. Docker build contexts exclude all ML material; Metro watches only shared code and dependencies. File existence does not enable inference. The current local training and numerical publication workflow is documented in [the ML guide](../../README.md).
