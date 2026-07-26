// 업체 실제 음식 사진 — 네이버 이미지 검색
// "{상호} 메뉴/음식" 으로 검색 후, 네이버 자체 음식·플레이스 CDN 사진만 채택한다.
// (간판·뉴스·유튜브·밈·SNS 등 비음식 노이즈를 도메인 필터로 걸러 '무조건 음식'에 가깝게.)
// 없으면 img "" 반환 → 앱이 카테고리 대표 음식 사진을 그대로 유지한다.
// 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요 (없으면 조용히 빈값 반환 → 앱은 정상 동작).

const NAVER_ID = process.env.NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET;
const cache = new Map();
const TTL = 7 * 24 * 3600 * 1000;   // 상호별 7일 캐시

// FOOD = '접시에 담긴 실제 음식' 사진이 잘 올라오는 곳 (최우선)
//  · 네이버 블로그/포스트 CDN  · 음식 갤러리(루리웹)
const FOOD = [
  "mblogthumb-phinf.pstatic.net", "blogfiles.pstatic.net", "postfiles.pstatic.net",
  "post-phinf.pstatic.net", "pup-post-phinf.pstatic.net", "blogpfthumb-phinf.pstatic.net",
  "ruliweb.com",
];
// 플레이스 DB = 실제 그 집이지만 간판·메뉴판·외관이 섞임 → 음식사진이 없을 때만 마지막 보조
const PLACE = ["ldb-phinf.pstatic.net"];
// 차단: 뉴스·유튜브·위키·SNS·밈·배달 간판사진 등 = 비음식/무관 노이즈
const DENY = [
  "imgnews.naver.net", "youtube", "ytimg", "googleusercontent", "namu.wiki",
  "bdtong", "diningcode", "dcinside", "coinpan", "cfile", "daumcdn", "tistory",
  "instagram", "fbcdn", "twimg", "kakaocdn", "ppomppu",
];

function inList(link, arr) {
  const u = String(link || "").toLowerCase();
  if (!u) return false;
  if (DENY.some(d => u.includes(d))) return false;
  return arr.some(a => u.includes(a));
}

async function search(q) {
  const url = `https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(q)}&display=30&sort=sim`;
  const r = await fetch(url, { headers: { "X-Naver-Client-Id": NAVER_ID, "X-Naver-Client-Secret": NAVER_SECRET } });
  const text = await r.text();
  let j = {}; try { j = JSON.parse(text); } catch (e) {}
  return { ok: r.ok, status: r.status, items: j.items || [], body: text.slice(0, 200) };
}

// 음식사진(블로그·음식갤러리) 최우선 → 네이버 프록시 썸네일 → 그래도 없으면 플레이스 사진 보조
function pick(items) {
  for (const it of items) if (inList(it.link, FOOD)) return it.link;
  for (const it of items) if (inList(it.thumbnail, FOOD)) return it.thumbnail;
  for (const it of items) if (inList(it.link, PLACE)) return it.link;
  return "";
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const q = (req.query && req.query.q) || "";
  const cat = (req.query && req.query.cat) || "";
  if (!NAVER_ID || !NAVER_SECRET) { res.status(200).json({ img: "", error: "NAVER 키 미설정" }); return; }
  if (!q) { res.status(400).json({ img: "", error: "q 필요" }); return; }

  const ck = q + "|" + cat;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL) { res.json(hit.data); return; }

  try {
    let img = "";
    // '메뉴'는 메뉴판 사진을 부르므로 제외. 블로그 리뷰가 잘 걸리는 음식·맛집 위주 쿼리.
    const tries = [`${q} 음식`, `${q} 맛집 ${cat}`.trim(), `${q} 리뷰`];
    for (const t of tries) {
      const s = await search(t);
      if (s.items.length) { img = pick(s.items); if (img) break; }
    }
    const data = { img, kind: img ? "place" : "" };
    cache.set(ck, { t: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.json({ img: "", error: String(e) });
  }
};
