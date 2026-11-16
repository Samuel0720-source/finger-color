// What the assistant knows. Every answer here was written by hand and checked against the app
// and the medical sources listed at the bottom. Used in two places:
//   - in the browser, to answer common questions with no AI at all (faq.js)
//   - on the server, as the facts the AI model must stick to (server/chat-core.js)
//
// To add an answer: add an entry with `keys` (words people type, lower case, English and Korean),
// the answer in `en` and `ko`, and optionally `actions` (buttons, see actions.js) and `source`.
// `mode` means "prefer this entry when the user is on that check".
// `first` marks the safety answers (diagnosis, treatment, cold tests): when they match, they win.

export const SOURCES = {
  niams_raynaud: { title: "Raynaud's phenomenon, NIAMS (NIH)", url: 'https://www.niams.nih.gov/health-topics/raynauds-phenomenon' },
  nhs_raynaud: { title: "Raynaud's, NHS", url: 'https://www.nhs.uk/conditions/raynauds/' },
  nhs_trigger: { title: 'Trigger finger, NHS', url: 'https://www.nhs.uk/conditions/trigger-finger/' },
  nhs_carpal: { title: 'Carpal tunnel syndrome, NHS', url: 'https://www.nhs.uk/conditions/carpal-tunnel-syndrome/' },
};

export const ENTRIES = [
  {
    id: 'what_is_app',
    keys: ['how does finger', 'what is finger', 'what is this', 'what does this', 'how does this work', 'how does it work', 'what can you do', 'about this app', '어떤 앱', '뭐하는', '무슨 앱', '어떻게 작동', '이게 뭐', '이 앱', '사이트가 뭐'],
    en: "finger-color is a hand check you do yourself in the browser. You pick one of three conditions (Raynaud's, trigger finger or carpal tunnel), answer questions taken from published clinical criteria, optionally let your camera measure your hand, and get a suggested next step plus a PDF for your doctor. It is a student research project, not a medical device, and it does not diagnose anything.",
    ko: 'finger-color는 브라우저에서 직접 해 보는 손 체크예요. 세 가지(레이노, 방아쇠 손가락, 손목터널) 중 하나를 고르고, 발표된 임상 기준에서 가져온 질문에 답한 뒤, 원하면 카메라로 손을 측정해요. 그러면 다음에 무엇을 하면 좋을지와 의사에게 보여 줄 PDF가 나와요. 학생 연구 프로젝트이고 의료기기가 아니며, 진단을 하지 않아요.',
    actions: ['go_how', 'go_home'],
  },
  {
    id: 'steps',
    keys: ['how do i start', 'how to start', 'where do i start', 'get started', 'begin', 'what do i do', 'first step', '어떻게 시작', '시작하', '뭐부터', '처음에', '어떻게 해'],
    en: 'Every check has the same three steps. 1) Symptoms: answer the questions. 2) Measure: an optional camera test. 3) Result: a suggested next step, the reasons, and a PDF button. Pick a condition at the top of the page, then press the Start button under it.',
    ko: '모든 체크는 똑같이 3단계예요. 1) Symptoms(증상): 질문에 답해요. 2) Measure(측정): 카메라 테스트인데 선택 사항이에요. 3) Result(결과): 다음에 할 일, 그 이유, PDF 버튼이 나와요. 페이지 맨 위에서 증상을 고르고 그 아래 Start 버튼을 누르세요.',
    actions: ['go_symptoms'],
  },
  {
    id: 'how_raynaud',
    mode: 'raynaud',
    keys: ['raynaud test', "raynaud's test", 'raynaud check', 'color recording', 'colour recording', 'record an episode', 'record color', 'warming up', 'normal color', 'baseline', '레이노 검사', '레이노 테스트', '레이노 체크', '색 기록', '색 녹화', '녹화', '정상 색'],
    en: "Raynaud's check, Measure step: 1) Choose Left or Right under the camera box and press Start camera. 2) Optional: when your hands are warm and normal, press Save normal color. 3) When your fingers are white or blue, press Start recording. 4) As soon as you start warming your hands, press \"I'm warming up now\". 5) Keep recording until the color is back to normal, at least 60 seconds, then press Stop recording. Do not cool your hands on purpose to cause an episode.",
    ko: '레이노 체크의 Measure 단계: 1) 카메라 화면 아래에서 Left(왼손)나 Right(오른손)를 고르고 Start camera를 눌러요. 2) 선택: 손이 따뜻하고 평소 색일 때 Save normal color를 눌러요. 3) 손가락이 하얗거나 파랄 때 Start recording을 눌러요. 4) 손을 데우기 시작하자마자 "I\'m warming up now"를 눌러요. 5) 색이 평소대로 돌아올 때까지, 적어도 60초 동안 계속 녹화하고 Stop recording을 눌러요. 증상을 만들려고 일부러 손을 차갑게 하지 마세요.',
    actions: ['open_raynaud', 'go_measure'],
  },
  {
    id: 'how_trigger',
    mode: 'trigger',
    keys: ['trigger finger test', 'trigger test', 'trigger check', 'movement test', 'make a fist', 'fist', '10 times', 'catch test', '방아쇠 검사', '방아쇠 테스트', '방아쇠 체크', '방아쇠수지', '주먹', '움직임 테스트'],
    en: 'Trigger finger check, Measure step: 1) Press Start camera and choose which hand is in view. 2) Turn your palm toward the camera with the whole hand in view. 3) Press Start test and hold your hand open for the countdown. 4) Slowly make a fist and open it all the way, 10 times. The test stops by itself. Stop if it hurts, and never force a locked finger.',
    ko: '방아쇠 손가락 체크의 Measure 단계: 1) Start camera를 누르고 어느 손인지 골라요. 2) 손바닥을 카메라 쪽으로 하고 손 전체가 화면에 보이게 해요. 3) Start test를 누르고 카운트다운 동안 손을 편 채로 있어요. 4) 천천히 주먹을 쥐었다가 끝까지 펴는 것을 10번 해요. 테스트는 스스로 멈춰요. 아프면 멈추고, 걸린 손가락을 억지로 펴지 마세요.',
    actions: ['open_trigger', 'go_measure'],
  },
  {
    id: 'how_carpal',
    mode: 'carpal',
    keys: ['carpal tunnel test', 'carpal test', 'carpal check', 'thumb reach', 'phalen', 'tinel', 'two-point', 'two point', 'guided test', 'cts-6', 'cts6', '손목터널 검사', '손목터널 테스트', '손목터널 체크', '엄지 닿기', '팔렌', '티넬'],
    en: 'Carpal tunnel check, Measure step. There are three guided self-tests on the page (Phalen test, Tinel sign and two-point feeling), each with its own instructions; tests you skip count as "not checked". There is also a camera test: press Start camera, turn your palm toward the camera, press Start thumb reach test, and after the countdown touch your thumb tip to your index, middle, ring and little fingertip in that order. You have 6 seconds per finger.',
    ko: '손목터널 체크의 Measure 단계예요. 페이지에 안내형 자가 테스트 3개(Phalen 테스트, Tinel 징후, 두 점 구별)가 있고 각각 설명이 붙어 있어요. 건너뛴 테스트는 "not checked(확인 안 함)"로 처리돼요. 카메라 테스트도 있어요: Start camera를 누르고 손바닥을 카메라 쪽으로 한 뒤 Start thumb reach test를 눌러요. 카운트다운이 끝나면 엄지 끝을 검지, 중지, 약지, 새끼손가락 끝에 순서대로 대요. 손가락마다 6초예요.',
    actions: ['open_carpal', 'go_measure'],
  },
  {
    id: 'camera_trouble',
    keys: ['camera not', "camera isn't", "camera doesn't", "camera won't", 'camera is not', 'not detecting', 'detecting my', 'detect my', 'recognize my', 'recognise my', "can't detect", "can't find my hand", 'no hand', 'hand not found', 'not working', 'permission', 'black screen', 'cannot open the camera', 'could not open', 'tracking', '카메라가 안', '카메라 안', '인식이 안', '인식 안', '인식 못', '인식을 못', '못 찾', '감지', '손을 못', '권한', '안 켜', '안 보여', '안돼', '안 돼'],
    en: 'Things to try, in order: 1) When the browser asks, allow camera access. If you blocked it, open the site settings (the icon left of the address bar), allow the camera and reload. 2) Close other apps that use the camera, such as video calls. 3) Show your whole hand, palm toward the camera, about 30 to 40 cm away, in steady light and against a plain background. 4) The badge on the video says "Hand found" or "No hand" and the frame rate; wait for "Hand found" before starting a test. 5) The first start downloads the hand model (about 8 MB), so it needs an internet connection.',
    ko: '순서대로 해 보세요. 1) 브라우저가 물어보면 카메라 사용을 허용해요. 이미 차단했다면 주소창 왼쪽 아이콘의 사이트 설정에서 카메라를 허용하고 새로고침해요. 2) 영상 통화처럼 카메라를 쓰는 다른 앱을 꺼요. 3) 손바닥을 카메라 쪽으로 해서 손 전체를 보여 주세요. 거리는 30~40cm, 조명은 일정하게, 배경은 단순하게요. 4) 영상 위 표시에 "Hand found"나 "No hand", 그리고 fps가 나와요. "Hand found"가 뜬 뒤에 테스트를 시작하세요. 5) 처음 켤 때 손 인식 모델(약 8MB)을 내려받기 때문에 인터넷 연결이 필요해요.',
    actions: ['go_measure'],
  },
  {
    id: 'not_scored',
    keys: ['not scored', 'did not count', "didn't count", 'not counted', "doesn't start", "won't start", 'countdown', 'interrupted', '점수가 안', '카운트가 안', '안 세', '시작이 안', '카운트다운'],
    en: 'A timed test is only scored when the recording is good enough to trust. Common causes: the hand left the view, the page was hidden or the screen locked mid-test, the frame rate was too low, or fewer than 10 full fists were counted. For the trigger finger test, hold your hand open and still until the countdown ends, then open your hand fully after every fist. Close other tabs if the frame rate is low, and run the test again.',
    ko: '시간을 재는 테스트는 기록을 믿을 수 있을 때만 점수를 매겨요. 흔한 원인: 손이 화면 밖으로 나감, 테스트 중에 페이지가 가려지거나 화면이 잠김, fps가 너무 낮음, 주먹을 끝까지 10번 다 세지 못함. 방아쇠 손가락 테스트는 카운트다운이 끝날 때까지 손을 편 채로 가만히 있고, 주먹을 쥘 때마다 손을 끝까지 펴 주세요. fps가 낮으면 다른 탭을 닫고 다시 해 보세요.',
    actions: ['go_measure'],
  },
  {
    id: 'results_meaning',
    keys: ['what does my result', 'result mean', 'understand my result', 'read the result', 'levels', 'unlikely', 'self-care', 'routine appointment', 'see a doctor soon', 'get care today', 'feature check', '결과가 무슨', '결과 뜻', '결과 의미', '결과를 어떻게', '단계가'],
    en: 'The Result step shows one of five suggestions: Unlikely, Self-care, Routine appointment, See a doctor soon, or Get care today. Under it, the feature table lists each hallmark feature of the condition as Present, Absent or Not checked, and how it was checked (your answer, a guided test or the camera). "Why" lists the reasons for the suggestion. It is a suggestion about seeing a doctor, not a diagnosis, and "Not checked" never means normal.',
    ko: 'Result 단계에는 다섯 가지 제안 중 하나가 나와요: Unlikely(가능성 낮음), Self-care(자가 관리), Routine appointment(일반 진료 예약), See a doctor soon(곧 진료), Get care today(오늘 진료). 그 아래 표에는 각 특징이 Present(있음), Absent(없음), Not checked(확인 안 함)로 나오고, 어떻게 확인했는지(답변, 안내형 테스트, 카메라)도 나와요. "Why"에는 그 제안의 이유가 적혀 있어요. 이것은 진료를 볼지에 대한 제안이지 진단이 아니고, "Not checked"는 정상이라는 뜻이 아니에요.',
    actions: ['go_result'],
  },
  {
    id: 'pdf',
    keys: ['pdf', 'report', 'download', 'csv', 'print', 'share with my doctor', 'show my doctor', '리포트', '보고서', '다운로드', '내려받', '의사에게 보여'],
    en: 'In the Result step, press "Download PDF for your doctor". The button works once you have at least one answer or measurement. The PDF lists your answers, the feature table, any camera measurements and the sources. In the Measure step, "Raw data for analysis (CSV)" downloads the numbers the camera recorded. Files are made on your device.',
    ko: 'Result 단계에서 "Download PDF for your doctor"를 누르세요. 답변이나 측정이 하나라도 있으면 버튼이 켜져요. PDF에는 답변, 특징 표, 카메라 측정값, 출처가 들어가요. Measure 단계의 "Raw data for analysis (CSV)"는 카메라가 기록한 숫자를 내려받아요. 파일은 이 기기에서 만들어져요.',
    actions: ['go_result'],
  },
  {
    id: 'privacy',
    keys: ['privacy', 'private', 'upload', 'is my video', 'where is my data', 'data safe', 'stored', 'save my', 'who can see', '개인정보', '영상이 저장', '업로드', '어디에 저장', '안전', '누가 볼'],
    en: 'Your camera video is analyzed on your device and is never uploaded. Your answers stay in this browser tab, and the measurement history is stored only in this browser. This chat is different: common questions are answered on your device, but when the AI is used, the text you type is sent to a server and on to Google Gemini. On the free tier Google may use that text to improve its products, so do not type names or other personal details. A result summary is only sent if you press the button that says so.',
    ko: '카메라 영상은 이 기기에서 분석되고 업로드되지 않아요. 답변은 이 브라우저 탭에만 있고, 측정 기록은 이 브라우저에만 저장돼요. 이 채팅은 달라요: 자주 묻는 질문은 이 기기에서 답하지만, AI를 쓸 때는 입력한 글이 서버를 거쳐 Google Gemini로 전송돼요. 무료 등급에서는 Google이 그 글을 제품 개선에 쓸 수 있으니 이름 같은 개인정보는 적지 마세요. 결과 요약은 보내겠다는 버튼을 눌렀을 때만 전송돼요.',
    actions: ['go_privacy'],
  },
  {
    id: 'history',
    keys: ['history', 'previous results', 'past results', 'compare', 'over time', '기록', '이전 결과', '지난 결과', '비교'],
    en: 'Measurement history, below the check, lists the camera measurements you completed in this browser, with a small chart. It is kept in this browser only, so it is not on your other devices. Compare like with like: same hand, same camera and same room.',
    ko: '체크 아래의 Measurement history에는 이 브라우저에서 끝낸 카메라 측정이 작은 그래프와 함께 나와요. 이 브라우저에만 저장되기 때문에 다른 기기에서는 안 보여요. 같은 손, 같은 카메라, 같은 방에서 잰 것끼리 비교하세요.',
    actions: ['go_history'],
  },
  {
    id: 'accuracy',
    keys: ['accurate', 'accuracy', 'reliable', 'validated', 'trust', 'how good', 'is it correct', 'error', 'clinically', '정확', '믿을', '검증', '오차', '신뢰'],
    en: 'It has not been validated on patients, so treat it as a screening aid. The questions come from published clinical criteria, but those were written for clinicians examining a patient; answering and testing yourself is less reliable. The camera thresholds are engineering choices checked on synthetic signals and a small pilot with healthy volunteers. A single camera also reads a fully straight finger poorly when the palm faces it. If the result and how you feel disagree, trust how you feel and ask a doctor.',
    ko: '환자를 대상으로 검증되지 않았기 때문에 선별을 돕는 도구로만 봐 주세요. 질문은 발표된 임상 기준에서 가져왔지만, 그 기준은 의료진이 환자를 진찰할 때 쓰도록 만든 것이라 스스로 답하고 테스트하면 덜 정확해요. 카메라 기준값은 공학적으로 정한 것으로, 합성 신호와 건강한 지원자 몇 명의 예비 시험으로만 확인했어요. 카메라 한 대로는 손바닥이 카메라를 향할 때 완전히 편 손가락을 잘 못 읽어요. 결과와 느낌이 다르면 느낌을 믿고 의사에게 물어보세요.',
    actions: ['go_how'],
  },
  {
    id: 'about_raynaud',
    keys: ['what is raynaud', "raynaud's phenomenon", 'raynaud phenomenon', 'raynauds', 'fingers turn white', 'fingers turn blue', 'white fingers', 'blue fingers', 'cold fingers', '레이노', '레이노드', '손가락이 하얗', '손가락이 파랗', '손이 차'],
    en: "Raynaud's phenomenon is when the small blood vessels in the fingers (and sometimes toes) narrow more than they should, usually in the cold or under stress. Less blood gets through, so the fingers turn pale or white, may turn blue, and can feel cold or numb. As they warm up they may tingle or burn. The common form has no known cause and is usually mild; a less common form is linked to another condition and tends to be more serious. Keeping your hands and whole body warm is the main self-care.",
    ko: '레이노 현상은 손가락(가끔 발가락)의 작은 혈관이 주로 추위나 스트레스에 필요 이상으로 좁아지는 거예요. 피가 덜 통해서 손가락이 창백하거나 하얗게 되고, 파랗게 변하기도 하며, 차갑거나 저릴 수 있어요. 다시 따뜻해질 때 따끔거리거나 화끈거릴 수 있어요. 흔한 형태는 원인이 알려져 있지 않고 대개 가벼워요. 덜 흔한 형태는 다른 질환과 관련이 있고 더 심한 편이에요. 손과 몸 전체를 따뜻하게 유지하는 것이 기본 자가 관리예요.',
    actions: ['open_raynaud'],
    source: 'niams_raynaud',
    source2: 'nhs_raynaud',
  },
  {
    id: 'about_trigger',
    keys: ['what is trigger finger', 'trigger finger', 'trigger thumb', 'finger locks', 'finger clicks', 'finger catches', 'stuck finger', 'finger pops', '방아쇠 손가락', '방아쇠', '손가락이 걸', '손가락이 딸깍', '손가락이 안 펴'],
    en: 'Trigger finger is when a finger or thumb catches or locks as you bend and straighten it. It happens when the tendon that bends the finger thickens and no longer glides smoothly. Typical signs are a click or pop, stiffness that is often worse in the morning, pain at the base of the finger, and sometimes needing the other hand to straighten it. It is more likely after 40 and in people with diabetes or rheumatoid arthritis. It sometimes settles by itself; a doctor can offer treatment if it does not improve or gets in the way of daily tasks.',
    ko: '방아쇠 손가락은 손가락이나 엄지를 굽혔다 펼 때 걸리거나 잠기는 거예요. 손가락을 굽히는 힘줄이 두꺼워져서 매끄럽게 움직이지 못할 때 생겨요. 딸깍 소리나 튕기는 느낌, 아침에 더 심한 뻣뻣함, 손가락 뿌리 쪽 통증이 흔하고, 가끔은 다른 손으로 펴 줘야 해요. 40세 이후, 그리고 당뇨병이나 류마티스 관절염이 있는 사람에게 더 잘 생겨요. 저절로 나아지기도 하지만, 나아지지 않거나 일상에 방해가 되면 의사가 치료를 권할 수 있어요.',
    actions: ['open_trigger'],
    source: 'nhs_trigger',
  },
  {
    id: 'about_carpal',
    keys: ['what is carpal tunnel', 'carpal tunnel', 'numb fingers', 'tingling', 'pins and needles', 'numb at night', 'median nerve', '손목터널', '수근관', '손이 저', '손가락이 저', '저림'],
    en: 'Carpal tunnel syndrome is pressure on a nerve at the wrist (the median nerve). It causes numbness, tingling or pins and needles in the thumb, index, middle and ring fingers, an ache in the hand or arm, and sometimes a weak thumb or trouble gripping. Symptoms often come and go and tend to be worse at night. A wrist splint worn at night and cutting back on activities that bend the wrist a lot are common first steps; see a doctor if it is getting worse or not going away.',
    ko: '손목터널 증후군은 손목에서 신경(정중신경)이 눌리는 거예요. 엄지, 검지, 중지, 약지가 저리거나 찌릿하고, 손이나 팔이 쑤시며, 가끔 엄지 힘이 약해지거나 물건을 쥐기 어려워져요. 증상은 생겼다 없어졌다 하고 밤에 더 심한 편이에요. 밤에 손목 보호대를 차고 손목을 많이 굽히는 활동을 줄이는 것이 흔한 첫 단계예요. 점점 심해지거나 없어지지 않으면 의사에게 가세요.',
    actions: ['open_carpal'],
    source: 'nhs_carpal',
  },
  {
    id: 'mediapipe',
    keys: ['mediapipe', 'hand tracking', 'how does the camera', 'how do you measure', 'landmark', 'angle', 'ai model', 'how is it measured', '어떻게 측정', '손 추적', '각도', '어떻게 재'],
    en: 'The app uses MediaPipe hand tracking, which finds 21 points on your hand in every video frame, in your browser. For trigger finger it calculates the angle at the middle joint of each finger (180° means straight) and looks for a pause in mid-bend followed by a quick snap open. For carpal tunnel it measures whether the thumb tip reaches each fingertip. For Raynaud\'s it reads the skin color at each fingertip and compares it with your normal color over time.',
    ko: '이 앱은 MediaPipe 손 추적을 써요. 영상의 매 프레임마다 손에서 21개의 점을 찾고, 이 과정은 브라우저 안에서 이루어져요. 방아쇠 손가락은 각 손가락 가운데 마디의 각도(180°가 완전히 편 상태)를 계산해서, 굽히는 중간에 멈췄다가 갑자기 펴지는 순간을 찾아요. 손목터널은 엄지 끝이 각 손가락 끝에 닿는지 재요. 레이노는 각 손가락 끝의 피부색을 읽어서 시간에 따라 평소 색과 비교해요.',
    actions: ['go_how'],
  },
  {
    id: 'diagnosis',
    first: true,
    keys: ['do i have', 'diagnose', 'diagnosis', 'am i sick', 'is it serious', 'should i see a doctor', 'should i worry', 'is this normal', '진단', '병인가', '병이야', '심각', '병원 가야', '병원에 가야', '의사한테 가야', '정상이야', '정상인가'],
    en: 'I cannot tell you whether you have a condition, and neither can this app: only a clinician who examines you can diagnose. What the app can do is compare your answers and measurements with published criteria and suggest how soon to see a doctor. If a symptom worries you, is getting worse, or keeps coming back, it is reasonable to book an appointment whatever the app says.',
    ko: '어떤 질환이 있는지는 저도, 이 앱도 알려 드릴 수 없어요. 진단은 직접 진찰하는 의료진만 할 수 있어요. 이 앱이 할 수 있는 것은 답변과 측정값을 발표된 기준과 비교해서 얼마나 빨리 의사를 보면 좋을지 제안하는 거예요. 증상이 걱정되거나, 점점 심해지거나, 계속 반복되면 앱의 결과와 상관없이 진료를 예약하는 것이 좋아요.',
    actions: ['go_result'],
  },
  {
    id: 'treatment',
    first: true,
    keys: ['treatment', 'treat', 'medicine', 'medication', 'pill', 'drug', 'cure', 'surgery', 'injection', 'what should i take', 'dose', '치료', '약', '수술', '주사', '낫는', '복용'],
    en: 'I cannot recommend medicines, doses or a treatment plan. Those depend on an examination and your health history, so they are for a doctor or pharmacist to decide. I can explain in general terms what a condition is and what the app measured, and the links under my answers go to public health pages that describe the usual options.',
    ko: '약, 용량, 치료 계획은 권해 드릴 수 없어요. 진찰과 건강 이력에 따라 달라지기 때문에 의사나 약사가 정해야 해요. 질환이 무엇인지와 앱이 무엇을 쟀는지는 일반적인 수준에서 설명해 드릴 수 있고, 답변 아래 링크는 흔한 치료 방법을 설명하는 공공 보건 페이지로 연결돼요.',
  },
  {
    id: 'cold_test',
    first: true,
    keys: ['cold water', 'ice', 'make my fingers', 'cause an episode', 'trigger an episode', 'provoke', 'freezer', '찬물', '얼음', '일부러', '차갑게 해'],
    en: 'Please do not cool your hands on purpose to cause an episode, for example with ice or cold water. It can be painful and, for some people, harmful. The recording is meant for an episode that happens by itself: start recording when you notice the color change, then warm up as you normally would.',
    ko: '증상을 만들려고 얼음이나 찬물로 손을 일부러 차갑게 하지 마세요. 아플 수 있고 사람에 따라 해로울 수 있어요. 녹화는 저절로 생긴 증상을 위한 거예요. 색이 변하는 걸 알아챘을 때 녹화를 시작하고, 평소처럼 손을 데우세요.',
    actions: ['open_raynaud'],
  },
  {
    id: 'phone',
    keys: ['phone', 'mobile', 'iphone', 'android', 'ipad', 'tablet', 'back camera', 'laptop', '휴대폰', '핸드폰', '폰', '모바일', '아이폰', '노트북', '태블릿'],
    en: 'It works in a current browser on a phone, tablet or laptop. On a phone, use the back camera and hold the phone above your hand; on a laptop, hold your hand up to the webcam with the palm toward it. Keep the light steady and the whole hand in view.',
    ko: '휴대폰, 태블릿, 노트북의 최신 브라우저에서 돼요. 휴대폰에서는 후면 카메라를 쓰고 폰을 손 위쪽에서 들어 주세요. 노트북에서는 손바닥이 웹캠을 향하게 손을 들어요. 조명은 일정하게, 손 전체가 보이게 해 주세요.',
    actions: ['go_measure'],
  },
  {
    id: 'who_made',
    keys: ['who made', 'who built', 'who created', 'developer', 'author', 'student project', '누가 만들', '만든 사람', '개발자'],
    en: 'finger-color was built by Samuel Koo, a Biomedical Engineering student at the University of Waterloo, as a student research project.',
    ko: 'finger-color는 워털루 대학교 의생명공학과 학생 Samuel Koo가 학생 연구 프로젝트로 만들었어요.',
  },
];

export const byId = Object.fromEntries(ENTRIES.map((e) => [e.id, e]));

// The facts handed to the AI model, in English. It may only state app facts found here.
export function knowledgeText() {
  return ENTRIES.map((e) => `[${e.id}] ${e.en}`).join('\n');
}
