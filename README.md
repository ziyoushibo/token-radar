# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ziyoushibo/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ziyoushibo/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar: a dashboard that ranks pre-token protocols by the implied value of a launch that has not happened yet, each with the steps to farm it. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

`main.ts` reads the sealed DefiLlama snapshot, scores every rankable pre-token protocol with the radar-2 model — a tiered multiple on TVL, clamped seven-day growth, maturity (how long it has run with no token) and chain reach — and writes the ranked board, the dashboard's data, the dashboard itself and its dossier. Wrapped, staked and bridged products are left out of the ranking: their token already trades. The dashboard is a static page with a sortable, filterable board, a live-token view set apart with market caps, and a full detail page per protocol showing the model's arithmetic and its farm plan.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=./out node main.ts --input ./path/to/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=6vt704rw&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
