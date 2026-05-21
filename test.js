const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

async function fetchLivePrice(sym) {
  try {
    const url = `${YAHOO_BASE}${encodeURIComponent(sym)}?interval=1d&range=3mo`;
    const proxied = `${CORS_PROXY}${encodeURIComponent(url)}`;
    console.log("Fetching:", proxied);
    const res = await fetch(proxied, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error("No data");
    console.log("Got result for", sym, result.meta.regularMarketPrice);
    return true;
  } catch(e) {
    console.error("Error for", sym, e.message);
    return null;
  }
}

fetchLivePrice("RELIANCE.NS").then(() => console.log("Done"));
