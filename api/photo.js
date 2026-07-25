// 업체 사진 조회 — 카카오 이미지 검색(다음)
// 1) "{상호} 음식" 으로 음식 사진 우선 → 2) 없으면 "{상호}" 매장 사진.
// KAKAO_REST_KEY 재사용. 쿼리별 캐시.
const KAKAO_KEY = process.env.KAKAO_REST_KEY;
const cache = new Map();
const TTL = 7 * 24 * 3600 * 1000;

async function search(q) {
  const url = `https://dapi.kakao.com/v2/search/image?query=${encodeURIComponent(q)}&sort=accuracy&size=5`;
  const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  const text = await r.text();
  let j = {}; try { j = JSON.parse(text); } catch (e) {}
  return { ok: r.ok, docs: j.documents || [], status: r.status, body: text.slice(0, 200) };
}
function pick(docs) { const d = docs[0]; return d ? (d.thumbnail_url || d.image_url || "") : ""; }

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const q = (req.query && req.query.q) || "";
  if (!KAKAO_KEY) { res.status(500).json({ img: "", error: "KAKAO_REST_KEY 미설정" }); return; }
  if (!q) { res.status(400).json({ img: "", error: "q 필요" }); return; }

  const hit = cache.get(q);
  if (hit && Date.now() - hit.t < TTL) { res.json(hit.data); return; }

  try {
    // 음식 사진만 사용. 없으면 img "" → 앱이 카테고리 대표 음식 이미지로 대체.
    let img = "";
    let s = await search(`${q} 음식`);
    if (!s.docs.length) s = await search(`${q} 맛집`);   // 한 번 더 음식 위주로 시도
    if (s.docs.length) img = pick(s.docs);
    const data = { img, kind: img ? "food" : "" };
    cache.set(q, { t: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.json({ img: "", error: String(e) });
  }
};
