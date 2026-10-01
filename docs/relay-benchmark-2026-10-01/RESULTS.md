# Live Relay keyboard pilot

6/40 scored attempts are closed. This is an interim checkpoint, not a winner or a finished comparison.

The same ten exact targets are attempted by fresh GPT-6 Luna instances at high reasoning effort, using only supplied links. Forms, JavaScript and constructed URLs are excluded. Exact body, reply and digest verification gate completion. Failed attempts remain in the denominator; a successful rerun cannot replace one.

| Method | Closed | Exact completions | Failures | Median completed activations | Spent activations, all attempts |
| --- | ---: | ---: | ---: | ---: | ---: |
| chunk-word | 1 | 1 | 0 | 38 | 38 |
| predictive-word | 2 | 2 | 0 | 58 | 116 |
| prefix-link | 2 | 0 | 2 | — | 7 |
| token-link | 1 | 1 | 0 | 31 | 35 |

Completed-case medians use different subsets when completion differs; consult the paired case data before comparing them. Entry-to-receipt time starts at the first recorded activation; preparation/dispatch queue delay is exported separately. Full wall time remains available and includes that delay. Neither timing removes tool latency or client decisions.

Calibration, receipt-parser faults and account interruptions precede the scored cohort and are retained separately. An early Prefix failure reflects the observed tester’s inability to proceed under the supplied-link profile; it is not a proof that every text is unreachable. Recovery probes are deterministic engineering checks and do not estimate agent speed.

This purposive short pilot supports workload-specific observations, not confidence intervals, a graph optimum, universal coverage or broad model performance. It does not include a near-1,200-byte target or ordinary-browser/form conditions. Wire bytes exclude headers/TLS, and o200k extraction tokens are a common volume proxy rather than Luna billing.

See [fixed plan](../../relay/benchmark/plan.json), [release and client freeze](freeze.json), [paired comparison](comparison.json), [per-run facts](runs.json), and [CSV](runs.csv). Raw bearer traces remain private.
