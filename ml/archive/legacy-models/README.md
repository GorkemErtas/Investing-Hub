# Quarantined historical models

One copy of the six original ONNX files and their scaler/metadata JSON. Both old backend locations were byte-for-byte identical; `checksums.json` records SHA-256 and size before consolidation. Files are retained solely as historical research material: their training data, features, evaluation and provenance cannot be verified.

No application imports this directory. Docker build contexts exclude all ML material; Metro watches only shared code and dependencies. File existence does not approve inference. Current research and publication policy live in `ml/README.md` and the shared disabled prediction contract.
