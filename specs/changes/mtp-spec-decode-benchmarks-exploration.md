# Multi-Token Prediction (MTP) Benchmarks
#draft

Multi-Token Prediction (MTP) is a commonly-used technique to increase output token throughput by parallelizing the token generation process. This requires support in the model architecture and model serving engine.

Questions for llm-d
* How does MTP impact the configuration of other elements of the orchestration layer, e.g. infra topology?
* How does MTP impact parallelism strategies like TP, DP, EPLB?
* How do we represent models that leverage MTP in our benchmarked guides? Do we simply need to report metadata like the MTP window, average acceptance length, e.g. 2.4.

# References
https://www.lmsys.org/blog/2025-07-17-mtp/ 