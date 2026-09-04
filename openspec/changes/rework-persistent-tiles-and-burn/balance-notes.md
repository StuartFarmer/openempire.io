# Freeze balance baseline

No freeze-time rebalance was performed. Task 8 reproduced the unchanged OpenFront reference hashes and metrics after persistent-tile and burn work:

- Verdantia `base-0`: hash `801065038163313`, alive 19, leader 24.7%, Gini 0.716, first elimination 1053.
- Verdantia `base-1`: hash `2069060768539590`, alive 15, leader 21.5%, Gini 0.631, first elimination 803.
- SPQR `base-0`: hash `4964847657180561`, alive 15, leader 12.8%, Gini 0.312, first elimination 803.

All reproduction checks reported `IDENTICAL`. These unchanged references are the post-change freeze baseline; a separate before/after turnkey-conquest tuning sweep was intentionally not introduced during the foundation freeze.
