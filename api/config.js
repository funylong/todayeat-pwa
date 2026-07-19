// 클라이언트에 전달할 공개 설정 (카카오 JavaScript 키)
// JS 키는 도메인 제한이 걸린 공개 키라 프런트에 노출돼도 됩니다.
module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({ kakaoJsKey: process.env.KAKAO_JS_KEY || "" });
};
