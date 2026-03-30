# Spec: RL Inference Benchmarking & Optimization

## 1. Landscape

The integration of Reinforcement Learning (RL) into LLM training pipelines—specifically techniques like RLAIF (Reinforcement Learning from AI Feedback), GRPO (Group Relative Policy Optimization), and Online DPO—has fundamentally shifted the requirements for inference infrastructure.

Unlike standard "Chat" applications where traffic follows roughly Poisson distributions (random arrivals), RL training imposes **step-function workloads** on inference systems.

### Key Components

1.  **The Actor (Policy Model):** Generates "rollouts" (candidate responses). This is a high-throughput generation task.
2.  **The Judge (Reward Model):** Evaluates the rollouts. This is often an "LLM-as-a-Judge" (JLM) which receives a massive burst of concurrent requests immediately after the Actor finishes generating.

### The "Bursty" Reality

As highlighted by AI21's scaling analysis, these components do not face steady traffic.

- **Micro-bursts:** A training step triggers N concurrent requests (where N = batch size \* num rollouts).
- **Idle valleys:** Between steps, the inference engine might sit idle while the gradient update occurs (unless interleaved with other jobs).
- **Synchronization barriers:** The training loop cannot proceed until _all_ evaluations are returned, making "tail latency" (P99/P100) far more critical than average latency.

### Current Tools & Metrics

- **Throughput (tokens/sec)** is the dominant metric for standard benchmarks, but for RL, **"Step Completion Time"** is the true bottleneck.
- **Queue Depth** (`vllm:num_requests_waiting`) matches the "client-perceived latency" better than GPU utilization stats.
- **OOM failures** are common because autoscalers designed for chat (CPU/GPU util) react too slowly to the nearly instantaneous arrival of thousands of requests.

---

## 2. Problem Identification & Prioritization

We identify three core friction points in benchmarking and serving RL inference workloads.

### P0: The "Queue Cliff" Blind Spot

Standard benchmarks measure performance in the "happy path" (steady state). They do not measure the **"Queue Cliff"**—the point where the KV cache saturates and requests spill over into the scheduler queue.

- **Problem:** Users don't know their system's "Max Concurrent Burst" capacity before OOMing or encountering massive latency spikes.
- **Metric Gap:** Missing metrics for "Queue Wait Time" vs "Inference Time" breakdown.

### P0: Burst Intolerance

Most serving stacks (and their default configs) are tuned for continuous batching of random arrivals.

- **Problem:** Default `max-num-seqs` or "tensor parallel" settings may be optimal for maximizing total tokens/sec but suboptimal for clearing a specific backlog size quickly (minimize makespan).
- **Evidence:** AI21 found that `tp=4` on H100s was a sweet spot for memory pooling, allowing larger batch sizes which is critical for bursts, even if `tp=8` had more theoretical compute.

### P1: Inefficient Autoscaling Signals

- **Problem:** Scaling on GPU Utilization is a lagging and noisy signal for RL.
- **Insight:** Queue size (`vllm:num_requests_waiting`) is the only reliable leading indicator for RL workloads. Existing benchmarks rarely stress-test the _autoscaler's_ reaction to queue depth.

---

## 3. Vision

We will build a **"Training-Loop Simulator" Benchmark**.

Instead of simulating 1000 independent users chatting, we will simulate **1 Training Job** requesting **1000 prompts simultaneously**, then waiting for all to finish, then repeating.

This benchmark will:

1.  **Stress Test Resilience:** Can the system handle a sudden injection of 4k requests without OOMing?
2.  **Optimize for "Makespan":** Measure how long it takes to clear a backlog, not just steady-state token rate.
3.  **Auto-Tune for Bursts:** helping users find the configuration (TP, Max Seqs, Cache Block Size) that maximizes "Burst Capacity" rather than just "Chat Throughput".

---

## 4. Requirements

### 4.1 Workload Modeling

- **REQ-1:** Support `StepWorkload` generator.
  - Parameters: `BatchSize` (e.g., 512), `ThinkTime` (simulating training step), `Concurrency` (immediate injection).
- **REQ-2:** Support `SharedDeployment` simulation.
  - Ability to run multiple `StepWorkload` generators with offset start times to simulate "interleaved" training jobs (the solution to the idle valley problem).

### 4.2 New Metrics

- **REQ-3: Step Completion Time:** The time from the first request sent to the last response received for a specific batch.
- **REQ-4: Queue Depth Over Time:** Sampling `vllm:num_requests_waiting` (or equivalent) at high frequency during the burst.
- **REQ-5: Failure Rate:** Specifically tracking 5xx errors caused by OOM or timeouts during bursts.

### 4.3 Secondary Metrics

While "Step Completion" is primary, we must also track:

- **Time-To-First-Token (TTFT):** High TTFT indicates scheduler overhead or extreme queuing.
- **Inter-Token Latency (TPOT):** High TPOT indicates compute saturation (or communication overhead if TP is too high).
- **Request Latency Distribution:** P50 vs P99. High variance is bad for synchronization.

### 4.4 Evaluation & Analysis

- **REQ-6: The "Sweet Spot" Finder:** Automated sweep of `tensor_parallel_size` and `max_num_seqs` to find the Pareto frontier for Burst Capacity vs. Latency.
- **REQ-7: Safe-Zone Estimation:** Output a "Recommended Max Concurrent Jobs" based on the measured "Queue Cliff".

### 4.4 Infrastructure

- **REQ-8:** Integration with Prometheus/Metrics endpoint of the SUT (System Under Test) to correlate client-side latency with server-side queue depth.
