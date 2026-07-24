// 업체 사진 조회 — 카카오 이미지 검색(다음)으로 상호명 사진 1장 반환
// KAKAO_REST_KEY 재사용. 쿼리별 캐시.
const KAKAO_KEY = process.env.KAKAO_REST_KEY;
const cache = new Map();
const TTL = 7 * 24 * 3600 * 1000;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const q = (req.query && req.query.q) || "";
  if (!KAKAO_KEY) { res.status(500).json({ img: "", error: "KAKAO_REST_KEY 미설정" }); return; }
  if (!q) { res.status(400).json({ img: "", error: "q 필요" }); return; }

  const hit = cache.get(q);
  if (hit && Date.now() - hit.t < TTL) { res.json(hit.data); return; }

  try {
    const url = `https://dapi.kakao.com/v2/search/image?query=${encodeURIComponent(q)}&sort=accuracy&size=5`;
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
    const text = await r.text();
    let j = {}; try { j = JSON.parse(text); } catch (e) {}
    const doc = (j.documents || [])[0];
    const data = { img: doc ? (doc.thumbnail_url || doc.image_url || "") : "" };
    if (!r.ok) data.debug = { status: r.status, body: text.slice(0, 200) };
    cache.set(q, { t: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.json({ img: "", error: String(e) });
  }
};
