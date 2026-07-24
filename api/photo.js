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
    let img = "", kind = "";
    const food = await search(`${q} 음식`);         // 음식 사진 우선
    if (food.docs.length) { img = pick(food.docs); kind = "food"; }
    if (!img) {                                      // 없으면 매장 사진
      const place = await search(q);
      if (place.docs.length) { img = pick(place.docs); kind = "place"; }
    }
    const data = { img, kind };
    cache.set(q, { t: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.json({ img: "", error: String(e) });
  }
};
