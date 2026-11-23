// Token Radar's page. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a live-token view, and a full detail page per
// protocol. No network: every byte it shows is in data.js. The page recomputes each
// row's implied value from the snapshot figures with the model in DATA.model, so the
// number on screen and the number board.json carries are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var state = { view: 'board', slug: null, q: '', category: 'all', chain: 'all', minTvl: 0, watchlist: false, sort: 'implied', dir: -1 };
  var watchSet = {};
  (DATA.watchlist || []).forEach(function (s) { watchSet[s] = true; });

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtInt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  // The model, recomputed in the page from the row's own figures.
  function tierMultiple(tvl, m) {
    if (tvl < m.tier_small_tvl) return m.tier_small;
    if (tvl < m.tier_mid_tvl) return m.tier_mid;
    return m.tier_large;
  }
  function modelOf(row) {
    var m = DATA.model;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var tier = tierMultiple(row.tvl_usd, m);
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var maturityMult = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var reachMult = m.reach_floor + (Math.min(Math.max((row.chains || []).length, 0), m.reach_chains) / m.reach_chains) * m.reach_range;
    var implied = Math.max(1, Math.round(row.tvl_usd * tier * growthMult * maturityMult * reachMult));
    return { tier: tier, growthPct: growth, growthMult: growthMult, maturityMult: maturityMult, reachMult: reachMult, age: row.age_days, implied: implied };
  }

  // The farm plan, derived in the page from the same record main.ts scores.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 300;
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' (' + chain + ') and leave the deposit earning.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and hold the LP tokens.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' with ' + name + ', then put the bridged funds to work in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Post $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund ' + capital + ' and take one position in a market on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Place $' + capital + ' in a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('farm') >= 0) return "Deposit $" + capital + " into " + name + "'s farm on " + chain + ' and keep the position staked.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyActionFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the deposit once, then repay it, so the wallet shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap a small amount in the pool once a week, so the wallet shows trading as well as liquidity.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount back, or on to another chain, once, so the wallet shows repeat use.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the rewards once, so the position compounds instead of sitting still.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close and reopen one small hedge, so the wallet shows an active trader.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market and open another, so the wallet shows repeated play.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Top the vault up by a small amount once, so the wallet shows a returning depositor.';
    return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var steps = [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline where no one else can read it.', cost: 'under $3 of gas for the first transfer', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 200 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyActionFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days, so the activity spans more than one snapshot of the protocol.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'When the protocol opens a points or rewards page, claim only from the link that page itself publishes, and never pay anyone to claim for you.', cost: 'nothing to check; never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, so you can repeat the position or unwind it without guessing.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    return steps.map(function (s) {
      var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      if (t.length > 600) t = t.slice(0, 596) + '...';
      if (t.length < 20) t = t + " Hold the position and check the protocol's own page.";
      return t;
    });
  }

  // Hash routing: #/ the board, #/live the live-token view, #/detail/<slug> a protocol,
  // #/?q=&category=&chain=&minTvl=&watchlist=1 the board with a filter applied.
  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    state.view = 'board'; state.slug = null;
    if (h.indexOf('/detail/') === 0) { state.view = 'detail'; state.slug = decodeURIComponent(h.slice(8).split('/')[0]); return; }
    if (h === '/live') { state.view = 'live'; return; }
    if (h.indexOf('/?') === 0) {
      var params = new URLSearchParams(h.slice(2));
      if (params.get('q')) state.q = params.get('q');
      if (params.get('category')) state.category = params.get('category');
      if (params.get('chain')) state.chain = params.get('chain');
      if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
      if (params.get('watchlist')) state.watchlist = params.get('watchlist') === '1';
    }
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.watchlist) params.set('watchlist', '1');
    var q = params.toString();
    if (state.view === 'detail' && state.slug) { window.history.replaceState(null, '', '#/detail/' + encodeURIComponent(state.slug)); return; }
    if (state.view === 'live') { window.history.replaceState(null, '', '#/live'); return; }
    window.history.replaceState(null, '', q ? '#/?' + q : '#/');
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.watchlist && !watchSet[r.slug]) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function headerHtml() {
    return '<header class="top"><div class="brand"><span class="mark"></span><span>Token Radar</span></div>' +
      '<div class="top-meta"><span>Snapshot <b>' + esc(DATA.as_of) + '</b></span><span>DefiLlama protocol index</span>' +
      '<span>Model <b>' + esc(DATA.model_version) + '</b></span><span><b>' + DATA.board_size + '</b> protocols ranked</span></div></header>';
  }
  function ledeHtml() {
    return '<section class="lede"><h1>' + DATA.watchlist_size + ' watchlist protocols, ranked by implied value</h1>' +
      '<p>The watchlist is the floor: every protocol with at least ' + fmtUsd(DATA.floor_usd) + ' of TVL and no token on record. ' +
      'The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, and leaves out the wrapped, staked and ' +
      'bridged products whose token already trades. Implied value is a model, not a promise.</p>' +
      '<div class="facts">' +
      '<div class="fact"><span>Watchlist covered</span><b>' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b></div>' +
      '<div class="fact"><span>Pre-token rows scored</span><b>' + DATA.board_size + '</b></div>' +
      '<div class="fact"><span>Early rows below the floor</span><b>' + DATA.early_size + '</b></div>' +
      '<div class="fact"><span>Live-token set aside</span><b>' + DATA.live_size + '</b></div>' +
      '<div class="fact"><span>Total implied value</span><b class="gold">' + fmtUsd(DATA.total_implied_usd) + '</b></div>' +
      '</div></section>';
  }
  function controlsHtml() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 12);
    var opts = function (list, cur, allLabel) {
      return '<option value="all"' + (cur === 'all' ? ' selected' : '') + '>' + allLabel + '</option>' +
        list.map(function (v) { return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
    };
    return '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category">' + opts(cats, state.category, 'All categories') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain">' + opts(chains, state.chain, 'All chains') + '</select></div>' +
      '<div class="field"><label for="minTvl">Min TVL</label><select id="minTvl" aria-label="Filter by minimum TVL">' +
      '<option value="0"' + (state.minTvl === 0 ? ' selected' : '') + '>Any TVL</option>' +
      '<option value="100000000"' + (state.minTvl === 100000000 ? ' selected' : '') + '>$100M+</option>' +
      '<option value="500000000"' + (state.minTvl === 500000000 ? ' selected' : '') + '>$500M+</option>' +
      '<option value="1000000000"' + (state.minTvl === 1000000000 ? ' selected' : '') + '>$1B+</option></select></div>' +
      '<label class="check"><input type="checkbox" id="watchlist"' + (state.watchlist ? ' checked' : '') + '> Watchlist only</label>' +
      '<div class="tabs"><button type="button" id="tab-board" aria-pressed="true">Pre-token board</button>' +
      '<button type="button" id="tab-live" aria-pressed="false">Live token</button></div>' +
      '<span class="count" id="count"></span></div>';
  }
  function sortTh(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' &#9660;' : ' &#9650;') : '';
    return '<th scope="col"><button type="button" data-sort="' + key + '">' + label + arrow + '</button></th>';
  }
  function boardTableHtml() {
    var list = sortedRows(filteredRows());
    var max = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
    if (list.length === 0) {
      return '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2>' +
        '<p>Clear the search or pick another category to see the board again.</p>' +
        '<button class="button primary" type="button" id="clear-filters">Clear filters</button></div></div>';
    }
    var rows = list.map(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var pct = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      return '<tr data-slug="' + esc(r.slug) + '" tabindex="0">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.category || 'Other') + ' on ' + esc((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + gc + '">' + growth + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></div></td>' +
        '<td><span class="status">no token</span></td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>' +
      '<thead><tr>' + sortTh('implied', 'Rank') + sortTh('name', 'Protocol') + sortTh('tvl', 'TVL') + sortTh('growth', '7d') + sortTh('age', 'Age') + sortTh('implied', 'Implied value') + '<th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }
  function liveTableHtml() {
    var rows = DATA.live.map(function (r) {
      return '<tr><td class="num">live</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.category || 'Other') + ' on ' + esc((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
        '<td><span class="status live">already trades</span></td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.</caption>' +
      '<thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }
  function modelPanelHtml() {
    var m = DATA.model;
    return '<section class="panel model"><h2>How implied value is computed</h2>' +
      '<p>Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.</p>' +
      '<div class="formula">implied = round( tvl_usd x tier x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (' + m.reach_floor + ' + min(chains, ' + m.reach_chains + ') / ' + m.reach_chains + ' x ' + m.reach_range + ') )\n' +
      'tier = ' + m.tier_small + ' while TVL is under ' + fmtUsd(m.tier_small_tvl) + ', ' + m.tier_mid + ' under ' + fmtUsd(m.tier_mid_tvl) + ', ' + m.tier_large + ' above it</div>' +
      '<p class="note">TVL, seven-day growth and the chain list come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. ' +
      'Wrapped, staked and bridged products are left out of the ranking: their token already trades. &ldquo;Records no token&rdquo; means DefiLlama records none, not that none exists.</p></section>';
  }
  function detailHtml(row) {
    var v = modelOf(row);
    var match = v.implied === row.implied_value_usd;
    var steps = farmSteps(row);
    var stepItems = steps.map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
    }).join('');
    var why = 'Ranked #' + row.rank + ' of ' + DATA.board_size + ': ' + fmtUsd(row.tvl_usd) + ' of TVL at a tier multiple of ' + v.tier +
      ', ' + fmtPct(row.change_7d) + ' over seven days, ' + fmtAge(row.age_days) + ' with no token on record and ' + (row.chains || []).length +
      ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ' give an implied value of ' + fmtUsd(row.implied_value_usd) + '.';
    return '<div class="shell"><div class="detail-head">' +
      '<a class="back" href="#/">&larr; Back to the board</a><br>' +
      '<span class="rank-badge">Rank ' + row.rank + ' of ' + DATA.board_size + '</span>' +
      '<h1>' + esc(row.name) + '</h1>' +
      '<p>' + esc(row.category || 'Other') + ' on ' + esc((row.chains || []).join(', ') || 'an unnamed chain') + ' &middot; records no token</p></div>' +
      '<div class="grid">' +
      '<div class="cell"><span>TVL</span><b>' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div class="cell"><span>Seven-day growth</span><b class="' + (row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(row.change_7d) + '</b></div>' +
      '<div class="cell"><span>Age with no token</span><b>' + fmtAge(row.age_days) + '</b></div>' +
      '<div class="cell"><span>Chains</span><b>' + fmtInt((row.chains || []).length) + '</b></div>' +
      '<div class="cell"><span>First listed</span><b>' + esc(row.listed_at || 'unknown') + '</b></div>' +
      '<div class="cell"><span>Implied value</span><b class="gold">' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '</div>' +
      '<section class="detail-section"><h2>Implied value, step by step</h2>' +
      '<table class="kv"><tbody>' +
      '<tr><td>TVL &times; tier multiple (' + v.tier + ')</td><td class="num">' + fmtUsd(row.tvl_usd) + ' &times; ' + v.tier + ' = ' + fmtUsd(row.tvl_usd * v.tier) + '</td></tr>' +
      '<tr><td>Growth multiplier (' + fmtPct(v.growthPct) + ' clamped)</td><td class="num">&times; ' + v.growthMult.toFixed(4) + '</td></tr>' +
      '<tr><td>Maturity multiplier (' + fmtAge(row.age_days) + ' with no token)</td><td class="num">&times; ' + v.maturityMult.toFixed(4) + '</td></tr>' +
      '<tr><td>Reach multiplier (' + (row.chains || []).length + ' chains)</td><td class="num">&times; ' + v.reachMult.toFixed(4) + '</td></tr>' +
      '<tr><td>Implied value</td><td class="num"><b>' + fmtUsd(row.implied_value_usd) + '</b></td></tr>' +
      '</tbody></table>' +
      '<p class="check-line">Model ' + esc(DATA.model_version) + ': the page recomputes this row as ' + fmtUsd(v.implied) +
      (match ? ', <b>the same number board.json carries.</b>' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.</p>' +
      '<p class="check-line">' + esc(why) + '</p></section>' +
      '<section class="detail-section"><h2>Farm plan</h2><ol class="steps">' + stepItems + '</ol></section></div>';
  }

  function bindBoard() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; writeHash(); render(); });
    var cat = document.getElementById('category');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var tvl = document.getElementById('minTvl');
    if (tvl) tvl.addEventListener('change', function () { state.minTvl = Number(tvl.value) || 0; writeHash(); render(); });
    var wl = document.getElementById('watchlist');
    if (wl) wl.addEventListener('change', function () { state.watchlist = wl.checked; writeHash(); render(); });
    var tabLive = document.getElementById('tab-live');
    if (tabLive) tabLive.addEventListener('click', function () { state.view = 'live'; writeHash(); render(); });
    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchlist = false; writeHash(); render(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-sort]'), function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      var open = function () { state.view = 'detail'; state.slug = tr.getAttribute('data-slug'); writeHash(); render(); window.scrollTo(0, 0); };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    var count = document.getElementById('count');
    if (count) count.textContent = filteredRows().length + ' rows shown';
  }

  function render() {
    var html = '';
    if (state.view === 'detail') {
      var row = null;
      for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === state.slug) { row = DATA.rows[i]; break; }
      if (!row) { state.view = 'board'; state.slug = null; }
      else { app.innerHTML = detailHtml(row); app.setAttribute('aria-busy', 'false'); return; }
    }
    html += '<div class="shell">' + headerHtml() + ledeHtml() + controlsHtml();
    if (state.view === 'live') {
      html += liveTableHtml();
    } else {
      html += boardTableHtml() + modelPanelHtml();
      html += '<p class="note">Implied value is a model, not a promise. The snapshot is DefiLlama&rsquo;s protocol index as of ' + esc(DATA.as_of) + '; it does not move. A protocol that records no token may still have one its record does not carry.</p>';
    }
    html += '</div>';
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    var tabLive = document.getElementById('tab-live');
    var tabBoard = document.getElementById('tab-board');
    if (tabLive && tabBoard) {
      tabLive.setAttribute('aria-pressed', state.view === 'live' ? 'true' : 'false');
      tabBoard.setAttribute('aria-pressed', state.view === 'live' ? 'false' : 'true');
      tabBoard.addEventListener('click', function () { state.view = 'board'; writeHash(); render(); });
      tabLive.addEventListener('click', function () { state.view = 'live'; writeHash(); render(); });
    }
    bindBoard();
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
})();
