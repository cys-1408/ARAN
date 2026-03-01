# Groth16 Circuit Artifacts

Place production circuit artifacts in this folder:

1. `location_proof.wasm`
2. `location_proof.zkey`
3. `verification_key.json`

The application loads these files from:

- `/zkp/location_proof.wasm`
- `/zkp/location_proof.zkey`
- `/zkp/verification_key.json`

Generation pipeline (example):

1. Compile circuit with `circom`.
2. Run trusted setup using `snarkjs groth16 setup`.
3. Export proving key (`.zkey`) and verification key (`verification_key.json`).
4. Copy artifacts to the app's static path so they are served at runtime.
