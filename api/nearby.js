// 오늘 뭐 먹지 — 주변 식당 조회 프록시 (Vercel 서버리스 함수)
// 카카오 로컬 '카테고리로 장소 검색'을 서버에서 호출해 앱 형식으로 정규화한다.
// 환경변수 KAKAO_REST_KEY 필요. 앱(브라우저)에는 키가 절대 노출되지 않는다.

const KAKAO_KEY = process.env.KAKAO_REST_KEY;
const TTL = 5 * 60 * 1000;          // 좌표별 5분 캐시
const cache = new Map();

// 카테고리 이미지(대표 사진) — 실제 업체 사진은 제휴/플레이스 연계 단계에서 교체
// 카테고리별 대표 음식 사진 (여러 장 → 매장마다 다르게 배정). 전부 '음식' 사진.
const IMG = {
  한식: [
    "https://search.pstatic.net/sunny/?type=b150&src=https%3A%2F%2Frecipe1.ezmember.co.kr%2Fcache%2Frecipe%2F2019%2F02%2F01%2F35db4e13c26d2c6172fda14b929e095d1.jpg",
    "https://search.pstatic.net/sunny/?type=b150&src=https%3A%2F%2Frecipe1.ezmember.co.kr%2Fcache%2Frecipe%2F2020%2F03%2F24%2Fbb5e2c7c2713cf8dacb2a068c699bd9a1_f.jpg",
  ],
  중식: [
    "https://search.pstatic.net/sunny/?type=b150&src=https%3A%2F%2Frecipe1.ezmember.co.kr%2Fcache%2Frecipe%2F2016%2F11%2F10%2F13e59e1b2539db1196695794dea341c51.jpg%3Fw%3D1000",
    "https://search.pstatic.net/common/?type=b150&src=https%3A%2F%2Fshop-phinf.pstatic.net%2F20250820_51%2F1755658363613h5DLJ_JPEG%2F31276414057650262_407014495.jpg",
  ],
  일식: [
    "https://search.pstatic.net/common/?type=b150&src=https%3A%2F%2Fpup-post-phinf.pstatic.net%2FMjAyNTEyMzFfMjEx%2FMDAxNzY3MTU3OTA1NTEx.JF1fKMDpbOYsodPrJAU_tuJqHMOqPilLXCaPoFO6074g.KwPOapl4V8aSlI6xkWEjbSw4Xa39muhKGPD7BQVlKqwg.JPEG%2F1C7B9387-2963-4D4C-9203-6AED4DBEED2B.jpg",
    "https://search.pstatic.net/sunny/?type=b150&src=https%3A%2F%2Fcdn.crowdpic.net%2Fdetail-thumb%2Fthumb_d_2BC90D249F0ADD26D13D52F2BC7C5160.jpg",
  ],
  양식: ["https://search.pstatic.net/sunny/?type=b150&src=https%3A%2F%2Fi.pinimg.com%2F736x%2F06%2Ff2%2Fab%2F06f2ab6acdfb81853d55ea632d5764f1.jpg"],
  분식: [
    "https://search.pstatic.net/sunny/?type=b150&src=https%3A%2F%2Fcdn.crowdpic.net%2Fdetail-thumb%2Fthumb_d_85E59986825A70553BA680C17FAB42B9.jpg",
    "https://search.pstatic.net/sunny/?type=b150&src=https%3A%2F%2Fcdn.crowdpic.net%2Fdetail-thumb%2Fthumb_d_60246C3F0E05B2AD74F5C1897666076A.jpg",
  ],
  카페: [
    "https://search.pstatic.net/sunny/?type=b150&src=https%3A%2F%2Fcdn.crowdpic.net%2Fdetail-thumb%2Fthumb_d_E0963D139B282403E5AA469362B8C6CE.jpg",
    "https://search.pstatic.net/sunny/?type=b150&src=https%3A%2F%2Fcdn.crowdpic.net%2Fdetail-thumb%2Fthumb_d_1E54EFF00A465EC8403D151D256170A0.jpg",
  ],
  버거: ["https://search.pstatic.net/common/?type=b150&src=http%3A%2F%2Fimgnews.naver.net%2Fimage%2F5312%2F2021%2F08%2F27%2F0000195075_001_20210827105421558.jpg"],
  치킨: ["https://search.pstatic.net/common/?type=b150&src=http%3A%2F%2Fimgnews.naver.net%2Fimage%2F009%2F2015%2F03%2F06%2F20150301_1425450827..jpg_99_20150306155922.jpg"],
  아시안: ["https://search.pstatic.net/sunny/?type=b150&src=https%3A%2F%2Fcdn.crowdpic.net%2Fdetail-thumb%2Fthumb_d_FB776485401F1DFB3FD40C801109D7E7.jpg"],
  기타: ["https://search.pstatic.net/sunny/?type=b150&src=https%3A%2F%2Frecipe1.ezmember.co.kr%2Fcache%2Frecipe%2F2020%2F03%2F24%2Fbb5e2c7c2713cf8dacb2a068c699bd9a1_f.jpg"],
};
function hashStr(s){ let h=0; s=s||""; for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))>>>0; } return h; }
function pickImg(cat, name){ const arr=IMG[cat]||IMG["기타"]; return arr[hashStr(name)%arr.length]; }

// 카카오 카테고리 → 앱 카테고리 매핑
const MAP = {
  한식:   { cat:"한식",   em:"🍚", slots:["점심","저녁"], tags:["한식"] },
  중식:   { cat:"중식",   em:"🍜", slots:["점심","저녁"], tags:["중식","마라탕/훠궈"] },
  일식:   { cat:"일식",   em:"🍣", slots:["점심","저녁"], tags:["일식","초밥/회"] },
  양식:   { cat:"양식",   em:"🍝", slots:["점심","저녁"], tags:["양식","파스타"] },
  분식:   { cat:"분식",   em:"🌶️", slots:["아침","점심","저녁"], tags:["분식","떡볶이","김밥"] },
  치킨:   { cat:"치킨",   em:"🍗", slots:["저녁"], tags:["치킨","야식"] },
  패스트푸드:{ cat:"버거", em:"🍔", slots:["점심","저녁"], tags:["양식","버거"] },
  분식점: { cat:"분식",   em:"🌶️", slots:["아침","점심","저녁"], tags:["분식"] },
  아시아음식:{ cat:"아시안", em:"🍲", slots:["점심","저녁"], tags:["아시안","면/국수"] },
  술집:   { cat:"한식",   em:"🍢", slots:["저녁"], tags:["한식","야식","고기/구이"] },
  뷔페:   { cat:"양식",   em:"🍽️", slots:["점심","저녁"], tags:["양식"] },
  카페:   { cat:"카페",   em:"☕", slots:["아침","점심"], tags:["카페","베이커리","브런치"] },
};
const DEFAULT = { cat:"기타", em:"🍽️", slots:["점심","저녁"], tags:["기타"] };

function mapCategory(categoryName) {
  const parts = String(categoryName || "").split(">").map(s => s.trim());
  const main = parts[1] || parts[0] || "";
  for (const key of Object.keys(MAP)) {
    if (main.includes(key) || (parts[2] || "").includes(key)) return MAP[key];
  }
  if (/카페|디저트|베이커리|커피/.test(categoryName)) return MAP["카페"];
  return DEFAULT;
}

async function kakao(group, lat, lng, page, radius) {
  const url = `https://dapi.kakao.com/v2/local/search/category.json`
    + `?category_group_code=${group}&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=15&page=${page}`;
  const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  const text = await r.text();
  let j = {}; try { j = JSON.parse(text); } catch (e) {}
  return { ok: r.ok, status: r.status, documents: j.documents || [], end: !!(j.meta && j.meta.is_end), body: text.slice(0, 300) };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const q = req.query || {};
  const lat = q.lat, lng = q.lng;
  if (!KAKAO_KEY) { res.status(500).json({ error: "KAKAO_REST_KEY 환경변수가 설정되지 않았습니다." }); return; }
  if (!lat || !lng) { res.status(400).json({ error: "lat, lng 쿼리 파라미터가 필요합니다." }); return; }

  const radius = Math.min(2000, Math.max(300, parseInt(q.radius || "1000", 10) || 1000));
  const key = `${(+lat).toFixed(3)},${(+lng).toFixed(3)},${radius}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) { res.json(hit.data); return; }

  try {
    let docs = [];
    let kakaoErr = null;
    for (const g of ["FD6", "CE7"]) {          // FD6 음식점, CE7 카페
      for (let page = 1; page <= 3; page++) {  // 더 다양한 후보 (최대 45곳/그룹)
        const rk = await kakao(g, lat, lng, page, radius);
        if (!rk.ok && !kakaoErr) kakaoErr = { status: rk.status, body: rk.body };
        docs = docs.concat(rk.documents);
        if (rk.end || !rk.ok) break;
      }
    }
    const seen = new Set();
    const items = docs.map(d => {
      const m = mapCategory(d.category_name);
      const addr = (d.road_address_name || d.address_name || "").split(" ").slice(-2).join(" ");
      return {
        menu: d.place_name,
        name: addr || m.cat,
        cat: m.cat, em: m.em, img: pickImg(m.cat, d.place_name),
        dist: parseInt(d.distance || "0", 10),
        price: "", slots: m.slots, tags: m.tags,
        tip: `가까운 ${m.cat}, 걸어서 갈 만해요`,
        lat: +d.y, lng: +d.x, url: d.place_url || "",
      };
    }).filter(x => { if (!x.menu || seen.has(x.menu)) return false; seen.add(x.menu); return true; })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 45);

    const data = { items, live: true, radius, ts: Date.now() };
    if (items.length === 0 && kakaoErr) data.debug = kakaoErr;   // 카카오가 거부한 경우 원인 표시
    cache.set(key, { t: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: "카카오 API 호출 실패", detail: String(e) });
  }
};
