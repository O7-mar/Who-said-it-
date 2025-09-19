// منطق اللعبة الرئيسي
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded and parsed");

    // تهيئة متغيرات اللعبة
    let gameState = {
        currentScreen: 'main-menu',
        difficulty: 'easy', // يبدأ بسهل
        poets: [],
        selectedCards: [], // Holds { poetId, poetName, verse, collected: false | 'player' | 'ai' }
        currentCorrectCard: null, // Holds the correct card data for the current challenge turn
        playerScore: 0,
        aiScore: 0,
        timer: 60, // وقت الحفظ 60 ثانية
        timerInterval: null,
        aiTimeoutId: null, // Added for AI response management
        gameRound: 0,
        cardsPerRound: 15, // تعديل عدد البطاقات إلى 15 بدلاً من 20
        stats: {
            completedRounds: 0,
            wonRounds: 0,
            bestResponseTime: 0,
            totalResponseTime: 0,
            totalResponses: 0
        }
    };

    // عناصر DOM الرئيسية
    const container = document.querySelector(".container");
    if (!container) {
        console.error("CRITICAL ERROR: Could not find .container element!");
        alert("حدث خطأ فادح في تحميل اللعبة. لا يمكن العثور على الحاوية الرئيسية.");
        return; // Stop execution if container is missing
    }

    // قوالب الشاشات
    const memoryPhaseTemplate = document.getElementById("memory-phase-template");
    const challengePhaseTemplate = document.getElementById("challenge-phase-template");
    const instructionsTemplate = document.getElementById("instructions-template");
    const statsTemplate = document.getElementById("stats-template");
    const resultTemplate = document.getElementById("result-template");

    // الأصوات
    const correctSound = document.getElementById("correct-sound");
    const wrongSound = document.getElementById("wrong-sound");
    const countdownSound = document.getElementById("countdown-sound");
    const winSound = document.getElementById("win-sound");
    const loseSound = document.getElementById("lose-sound");

    // عرض القائمة الرئيسية فوراً عند تحميل الصفحة
    showMainMenuWithTransition();

    // تحميل بيانات الشعراء والأبيات في الخلفية
    let dataLoaded = false;
    showLoading(); // إظهار مؤشر التحميل أثناء جلب البيانات

    // تحميل ملفات البيانات المتعددة وتجميعها
    Promise.all([
        fetch("data/poets_data.json").then(response => response.ok ? response.json() : Promise.reject("فشل في تحميل البيانات الأساسية")),
        fetch("data/poets_data_part2.json").then(response => response.ok ? response.json() : { poets: [] }),
        fetch("data/poets_data_part3.json").then(response => response.ok ? response.json() : { poets: [] }),
        fetch("data/poets_data_part4.json").then(response => response.ok ? response.json() : { poets: [] }),
        fetch("data/poets_data_part5.json").then(response => response.ok ? response.json() : { poets: [] }),
        fetch("data/poets_data_part6.json").then(response => response.ok ? response.json() : { poets: [] }),
        fetch("data/poets_data_part7.json").then(response => response.ok ? response.json() : { poets: [] }),
        fetch("data/poets_data_part8.json").then(response => response.ok ? response.json() : { poets: [] })
    ])
    .then(dataArray => {
        // تجميع بيانات الشعراء من جميع الملفات
        let allPoets = [];
        dataArray.forEach(data => {
            if (data && Array.isArray(data.poets)) {
                allPoets = allPoets.concat(data.poets);
            }
        });
        
        if (allPoets.length === 0) {
            throw new Error("لم يتم العثور على بيانات الشعراء في أي من الملفات.");
        }
        
        // معالجة بيانات الشعراء وضمان وجود جميع الحقول المطلوبة
        const processedPoets = allPoets.map((poet, index) => {
            // ضمان وجود معرف فريد لكل شاعر
            const id = poet.id || `poet_${index}_${Date.now()}`;
            
            // استخراج الأبيات من الشعر إذا كانت موجودة
            let verses = [];
            if (Array.isArray(poet.verses) && poet.verses.length > 0) {
                verses = poet.verses;
            } else if (Array.isArray(poet.poems) && poet.poems.length > 0) {
                verses = poet.poems.map(poem => {
                    // إذا كان الشعر كائن يحتوي على نص، استخرج النص
                    if (typeof poem === 'object' && poem.text) {
                        return poem.text;
                    }
                    // إذا كان الشعر نصاً مباشراً
                    else if (typeof poem === 'string') {
                        return poem;
                    }
                    return null;
                }).filter(verse => verse !== null); // إزالة القيم الفارغة
            }
            
            // إرجاع الشاعر مع جميع الحقول المطلوبة
            return {
                ...poet,
                id: id,
                name: poet.name || `شاعر ${index + 1}`,
                verses: verses
            };
        });
        
        // تصفية الشعراء للتأكد من أن لديهم أبيات
        gameState.poets = processedPoets.filter(poet => poet.verses && poet.verses.length > 0);
        
        console.log("تم تحميل وتهيئة بيانات الشعراء والأبيات بنجاح, count:", gameState.poets.length);
        
        // التحقق من وجود عدد كافٍ من الشعراء
        if (gameState.poets.length < gameState.cardsPerRound) {
            console.warn(`تم تحميل ${gameState.poets.length} شاعر فقط، وهو أقل من العدد المطلوب (${gameState.cardsPerRound}).`);
        }
        
        dataLoaded = true;
        hideLoading();
    })
    .catch(error => {
        console.error("خطأ في تحميل بيانات الشعراء والأبيات:", error);
        hideLoading();
        showError("حدث خطأ في تحميل بيانات اللعبة. يرجى تحديث الصفحة والمحاولة مرة أخرى.");
    });

    // --- Event Listeners for Main Menu ---
    function addMainMenuListeners() {
        const startGameBtn = document.getElementById("start-game");
        const instructionsBtn = document.getElementById("instructions");
        const statsBtn = document.getElementById("stats");
        const difficultyOptions = document.querySelectorAll(".main-menu .difficulty-option");

        if (startGameBtn) {
            startGameBtn.addEventListener("click", function() {
                if (!dataLoaded) {
                    showError("جاري تحميل بيانات اللعبة، يرجى الانتظار قليلاً...");
                    return;
                }
                startGame();
            });
        }

        if (instructionsBtn) {
             instructionsBtn.addEventListener("click", showInstructions);
        }

        if (statsBtn) {
             statsBtn.addEventListener("click", showStats);
        }

        difficultyOptions.forEach(option => {
            option.addEventListener("click", function() {
                difficultyOptions.forEach(opt => opt.classList.remove("selected"));
                this.classList.add("selected");
                gameState.difficulty = this.dataset.level;
                console.log("Difficulty set to:", gameState.difficulty);
            });
        });
    }

    // --- Screen Navigation ---
    function showScreen(screenTemplate) {
        if (!screenTemplate) {
            console.error("خطأ: قالب الشاشة غير موجود!");
            return;
        }
        if (gameState.aiTimeoutId) {
            clearTimeout(gameState.aiTimeoutId);
            gameState.aiTimeoutId = null;
        }
        if (gameState.timerInterval) {
             clearInterval(gameState.timerInterval);
             gameState.timerInterval = null;
        }

        const newScreen = document.createElement("div");
        if (screenTemplate.content) {
             newScreen.appendChild(screenTemplate.content.cloneNode(true));
        } else {
             console.error("خطأ: القالب لا يحتوي على خاصية content:", screenTemplate.id);
             newScreen.innerHTML = screenTemplate.innerHTML;
        }
        const screenElement = newScreen.firstElementChild;

        container.innerHTML = "";
        if (screenElement) {
            screenElement.classList.add("fade-in");
            container.appendChild(screenElement);
            addEventListenersToCurrentScreen();
        } else {
            console.error("خطأ: لم يتم إنشاء عنصر الشاشة من القالب:", screenTemplate ? screenTemplate.id : 'null');
            showError("حدث خطأ أثناء عرض الشاشة.");
            showMainMenuWithTransition();
        }
    }

    function addEventListenersToCurrentScreen() {
        const backBtnGeneral = document.querySelector(".instructions-screen .back-btn, .stats-screen .back-btn");
        if (backBtnGeneral) backBtnGeneral.addEventListener("click", showMainMenuWithTransition);

        const backBtnInGame = document.querySelectorAll(".memory-phase .back-btn, .challenge-phase .back-btn");
        backBtnInGame.forEach(btn => btn.addEventListener("click", confirmBackToMenu));

        if (gameState.currentScreen === "stats") {
            const resetBtn = document.querySelector(".reset-stats-btn");
            if (resetBtn) resetBtn.addEventListener("click", resetStats);
        } else if (gameState.currentScreen === "memory-phase") {
            const cards = document.querySelectorAll(".card");
            cards.forEach(card => {
                card.addEventListener("click", function() {
                    enlargeCard(this);
                });
            });
        } else if (gameState.currentScreen === "challenge-phase") {
            // تم تعديل هذا الجزء لاستخدام بطاقات الشعراء في الشبكة
            const poetCards = document.querySelectorAll(".poet-card");
            poetCards.forEach(card => {
                if (!card.classList.contains("collected-player") && !card.classList.contains("collected-ai")) {
                    card.addEventListener("click", function() {
                        handleAnswer(this.dataset.poetId, "player");
                    });
                }
            });
        } else if (gameState.currentScreen === "result") {
            const playAgainBtn = document.querySelector(".play-again-btn");
            const mainMenuBtn = document.querySelector(".main-menu-btn");
            if (playAgainBtn) playAgainBtn.addEventListener("click", startGame);
            if (mainMenuBtn) mainMenuBtn.addEventListener("click", showMainMenuWithTransition);
        }
    }

    function confirmBackToMenu() {
        // استخدام رسالة تأكيد مخصصة بدلاً من confirm الافتراضية
        showCustomConfirm("هل أنت متأكد أنك تريد العودة إلى القائمة الرئيسية؟ ستفقد تقدمك في هذه الجولة.", function(confirmed) {
            if (confirmed) {
                showMainMenuWithTransition();
            }
        });
    }

    // إضافة دالة لعرض رسالة تأكيد مخصصة
    function showCustomConfirm(message, callback) {
        // إزالة أي رسائل تأكيد سابقة
        const existingConfirm = document.querySelector('.custom-confirm');
        if (existingConfirm) {
            existingConfirm.remove();
        }
        
        // إنشاء طبقة مظلمة
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        document.body.appendChild(overlay);
        
        // إنشاء مربع التأكيد
        const confirmBox = document.createElement('div');
        confirmBox.className = 'custom-confirm';
        
        // إضافة الرسالة
        const messageElement = document.createElement('div');
        messageElement.className = 'custom-confirm-message';
        messageElement.textContent = message;
        confirmBox.appendChild(messageElement);
        
        // إضافة أزرار التأكيد
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'custom-confirm-buttons';
        
        // زر نعم
        const yesButton = document.createElement('button');
        yesButton.className = 'confirm-btn';
        yesButton.textContent = 'نعم';
        yesButton.addEventListener('click', function() {
            document.body.removeChild(overlay);
            document.body.removeChild(confirmBox);
            callback(true);
        });
        
        // زر لا
        const noButton = document.createElement('button');
        noButton.className = 'cancel-btn';
        noButton.textContent = 'لا';
        noButton.addEventListener('click', function() {
            document.body.removeChild(overlay);
            document.body.removeChild(confirmBox);
            callback(false);
        });
        
        // إضافة الأزرار إلى الحاوية
        buttonsContainer.appendChild(yesButton);
        buttonsContainer.appendChild(noButton);
        confirmBox.appendChild(buttonsContainer);
        
        // إضافة مربع التأكيد إلى الصفحة
        document.body.appendChild(confirmBox);
    }

    function showMainMenuWithTransition() {
        if (gameState.aiTimeoutId) clearTimeout(gameState.aiTimeoutId);
        gameState.aiTimeoutId = null;
        if (gameState.timerInterval) clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;

        const currentScreenElement = container.firstElementChild;
        if (currentScreenElement && currentScreenElement.classList.contains('main-menu-container')) {
            console.log("Already on main menu.");
            return;
        }

        if (currentScreenElement) {
            currentScreenElement.classList.remove("fade-in");
            currentScreenElement.classList.add("fade-out");
            setTimeout(() => {
                renderMainMenu();
            }, 300);
        } else {
             renderMainMenu();
        }
    }

    function renderMainMenu() {
        container.innerHTML = showMainMenuHTML();
        gameState.currentScreen = "main-menu";
        addMainMenuListeners();
        const newMainMenu = container.querySelector(".main-menu-container");
        if(newMainMenu) {
            requestAnimationFrame(() => {
                 newMainMenu.classList.add("fade-in");
            });
        } else {
            console.error("Failed to find .main-menu-container after rendering!");
        }
    }

    function showMainMenuHTML() {
        const instagramUser = "ub_oh"; 
        const html = `
            <div class="main-menu-container">
                <div class="game-title">
                    <h1>من قالها؟</h1>
                    <div class="subtitle">تحدي ثقافي سريع</div>
                </div>
                <div class="main-menu">
                    <div class="menu-item" id="start-game">ابدأ اللعبة</div>
                    <div class="difficulty-selector">
                        <div class="difficulty-label">مستوى الصعوبة:</div>
                        <div class="difficulty-options">
                            <div class="difficulty-option ${gameState.difficulty === "easy" ? "selected" : ""}" data-level="easy">سهل</div>
                            <div class="difficulty-option ${gameState.difficulty === "medium" ? "selected" : ""}" data-level="medium">متوسط</div>
                            <div class="difficulty-option ${gameState.difficulty === "hard" ? "selected" : ""}" data-level="hard">صعب</div>
                        </div>
                    </div>
                    <div class="menu-item" id="instructions">تعليمات</div>
                    <div class="menu-item" id="stats">الإحصائيات</div>
                </div>
                <div class="footer">
                    <div class="credits">
                        تطوير بواسطة O7 
                        <a href="https://www.instagram.com/${instagramUser}" target="_blank" class="instagram-link">
                            <img src="images/instagram-icon.png" alt="Instagram" class="instagram-icon"> ${instagramUser}
                        </a>
                    </div>
                </div>
            </div>
        `;
        return html;
    }

    // --- Game Logic Functions ---
    function startGame() {
        if (!dataLoaded || gameState.poets.length === 0) {
            showError("لم يتم تحميل بيانات اللعبة بعد. يرجى الانتظار قليلاً...");
            return;
        }

        // إعادة تعيين متغيرات اللعبة
        gameState.playerScore = 0;
        gameState.aiScore = 0;
        gameState.gameRound = 0;
        gameState.selectedCards = [];

        // اختيار عدد محدد من البطاقات عشوائياً
        selectRandomCards();

        // عرض مرحلة الحفظ
        showMemoryPhase();
    }

    function selectRandomCards() {
        // خلط قائمة الشعراء
        const shuffledPoets = [...gameState.poets].sort(() => Math.random() - 0.5);
        
        // اختيار عدد محدد من الشعراء
        const selectedPoets = shuffledPoets.slice(0, gameState.cardsPerRound);
        
        // إنشاء بطاقات للشعراء المختارين
        gameState.selectedCards = selectedPoets.map(poet => {
            // اختيار بيت شعري عشوائي للشاعر
            const randomVerseIndex = Math.floor(Math.random() * poet.verses.length);
            const verse = poet.verses[randomVerseIndex];
            
            return {
                poetId: poet.id,
                poetName: poet.name,
                verse: verse,
                collected: false
            };
        });
    }

    function showMemoryPhase() {
        gameState.currentScreen = "memory-phase";
        gameState.timer = 60; // وقت الحفظ 60 ثانية
        
        // إنشاء HTML لمرحلة الحفظ
        const memoryPhaseHTML = `
            <div class="memory-phase">
                <div class="phase-header">
                    <button class="back-btn ingame-back-btn">العودة للقائمة</button>
                    <h2>مرحلة الحفظ</h2>
                    <div class="timer">${gameState.timer} ثانية</div>
                </div>
                <div class="cards-container">
                    ${gameState.selectedCards.map(card => `
                        <div class="card" data-poet-id="${card.poetId}">
                            <div class="card-poet-name">${card.poetName}</div>
                            <div class="card-verse">${card.verse}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="phase-footer">احفظ البطاقات وأسماء الشعراء</div>
            </div>
        `;
        
        container.innerHTML = memoryPhaseHTML;
        addEventListenersToCurrentScreen();
        
        // بدء العد التنازلي
        startMemoryTimer();
    }

    function startMemoryTimer() {
        // تشغيل صوت العد التنازلي
        if (countdownSound) {
            countdownSound.currentTime = 0;
            countdownSound.play().catch(e => console.log("Could not play countdown sound:", e));
        }
        
        // بدء العد التنازلي
        gameState.timerInterval = setInterval(() => {
            gameState.timer--;
            
            // تحديث عرض العداد
            const timerElement = document.querySelector(".timer");
            if (timerElement) {
                timerElement.textContent = `${gameState.timer} ثانية`;
                
                // تغيير لون العداد عندما يقترب من النهاية
                if (gameState.timer <= 10) {
                    timerElement.classList.add("timer-warning");
                }
            }
            
            // انتهاء الوقت
            if (gameState.timer <= 0) {
                clearInterval(gameState.timerInterval);
                gameState.timerInterval = null;
                
                // الانتقال إلى مرحلة التحدي
                showChallengePhase();
            }
        }, 1000);
    }

    function enlargeCard(card) {
        // إنشاء نسخة مكبرة من البطاقة
        const enlargedCard = document.createElement("div");
        enlargedCard.className = "enlarged-card";
        enlargedCard.innerHTML = card.innerHTML;
        
        // إنشاء طبقة مظلمة
        const overlay = document.createElement("div");
        overlay.className = "overlay";
        
        // إضافة حدث النقر لإغلاق البطاقة المكبرة
        overlay.addEventListener("click", function() {
            document.body.removeChild(overlay);
            document.body.removeChild(enlargedCard);
        });
        
        // إضافة العناصر إلى الصفحة
        document.body.appendChild(overlay);
        document.body.appendChild(enlargedCard);
    }

    function showChallengePhase() {
        gameState.currentScreen = "challenge-phase";
        gameState.gameRound = 0;
        
        // خلط البطاقات لمرحلة التحدي
        gameState.selectedCards = gameState.selectedCards.sort(() => Math.random() - 0.5);
        
        // عرض شاشة التحدي
        renderChallengePhase();
        
        // بدء الجولة الأولى
        startNewRound();
    }

    function renderChallengePhase() {
        // إنشاء HTML لمرحلة التحدي
        const challengePhaseHTML = `
            <div class="challenge-phase">
                <div class="phase-header">
                    <button class="back-btn ingame-back-btn">العودة للقائمة</button>
                    <h2>التحدي</h2>
                </div>
                <div class="score">
                    <div class="score-section">
                        <div class="score-label">أنت</div>
                        <div class="score-value">${gameState.playerScore}</div>
                    </div>
                    <div class="score-section">
                        <div class="score-label">الذكاء الاصطناعي</div>
                        <div class="score-value">${gameState.aiScore}</div>
                    </div>
                </div>
                <div class="verse-display">
                    <div id="current-verse"></div>
                </div>
                <div class="poets-grid-container" id="poets-container">
                    <!-- سيتم إنشاء بطاقات الشعراء هنا ديناميكياً -->
                </div>
                <div class="phase-footer">احفظ البطاقات وأسماء الشعراء</div>
            </div>
        `;

        container.innerHTML = challengePhaseHTML;
        addEventListenersToCurrentScreen();
    }

    function startNewRound() {
        // التحقق من شروط الفوز والخسارة (5 نقاط)
        if (gameState.playerScore >= 5) {
            // اللاعب فاز
            showResult();
            return;
        }
        
        if (gameState.aiScore >= 5) {
            // الذكاء الاصطناعي فاز
            showResult();
            return;
        }
        
        if (gameState.gameRound >= gameState.selectedCards.length) {
            // انتهت جميع الجولات، عرض النتيجة النهائية
            showResult();
            return;
        }

        // تحديد البطاقة الحالية
        gameState.currentCorrectCard = gameState.selectedCards[gameState.gameRound];
        
        // عرض البيت الشعري الحالي
        const currentVerseElement = document.getElementById("current-verse");
        if (currentVerseElement) {
            currentVerseElement.textContent = gameState.currentCorrectCard.verse;
        }
        
        // إنشاء بطاقات الشعراء
        renderPoetCards();
        
        // زيادة عداد الجولة
        gameState.gameRound++;
        
        // بدء دور الذكاء الاصطناعي بعد فترة قصيرة
        setTimeout(() => {
            aiTurn();
        }, 1000);
    }

    function renderPoetCards() {
        const poetsContainer = document.getElementById("poets-container");
        if (!poetsContainer) return;
        
        // إنشاء قائمة بجميع الشعراء المتاحين
        const allPoets = gameState.selectedCards.map(card => ({
            id: card.poetId,
            name: card.poetName,
            collected: card.collected
        }));
        
        // خلط قائمة الشعراء
        const shuffledPoets = [...allPoets].sort(() => Math.random() - 0.5);
        
        // إنشاء HTML لبطاقات الشعراء
        poetsContainer.innerHTML = shuffledPoets.map(poet => {
            let classes = "poet-card";
            if (poet.collected === 'player') classes += " collected-player";
            if (poet.collected === 'ai') classes += " collected-ai";
            
            return `
                <div class="${classes}" data-poet-id="${poet.id}">
                    ${poet.name}
                </div>
            `;
        }).join('');
        
        // إضافة مستمعي الأحداث للبطاقات
        addEventListenersToCurrentScreen();
    }

    // تعديل منطق الإجابة ليكون محاولة واحدة فقط في كل جولة
    function handleAnswer(poetId, player) {
        // إيقاف دور الذكاء الاصطناعي إذا أجاب اللاعب
        if (player === "player" && gameState.aiTimeoutId) {
            clearTimeout(gameState.aiTimeoutId);
            gameState.aiTimeoutId = null;
        }
        
        // التحقق من صحة الإجابة
        const isCorrect = poetId === gameState.currentCorrectCard.poetId;
        
        if (player === "player") {
            // تسجيل وقت الاستجابة للاعب
            const responseTime = gameState.timer > 0 ? gameState.timer : 0;
            gameState.stats.totalResponseTime += responseTime;
            gameState.stats.totalResponses++;
            
            // تحديث أفضل وقت استجابة
            if (isCorrect && (gameState.stats.bestResponseTime === 0 || responseTime < gameState.stats.bestResponseTime)) {
                gameState.stats.bestResponseTime = responseTime;
            }
        }
        
        // تحديث البطاقة المختارة
        const cardIndex = gameState.selectedCards.findIndex(card => card.poetId === gameState.currentCorrectCard.poetId);
        if (cardIndex !== -1) {
            if (isCorrect) {
                // الإجابة صحيحة
                gameState.selectedCards[cardIndex].collected = player;
                
                // تحديث النتيجة
                if (player === "player") {
                    gameState.playerScore++;
                    if (correctSound) correctSound.play().catch(e => console.log("Could not play correct sound:", e));
                } else {
                    gameState.aiScore++;
                }
                
                // تحديث عرض النتيجة
                updateScore();
                
                // تمييز الإجابة الصحيحة
                highlightAnswer(poetId, isCorrect);
                
                // الانتقال إلى الجولة التالية بعد فترة قصيرة
                setTimeout(() => {
                    startNewRound();
                }, 1500);
            } else {
                // الإجابة خاطئة
                if (player === "player") {
                    if (wrongSound) wrongSound.play().catch(e => console.log("Could not play wrong sound:", e));
                    
                    // تمييز الإجابة الخاطئة
                    highlightAnswer(poetId, isCorrect);
                    
                    // إذا أخطأ اللاعب، يحصل الذكاء الاصطناعي على النقطة مباشرة
                    gameState.aiScore++;
                    updateScore();
                    
                    // تمييز الإجابة الصحيحة بعد فترة قصيرة
                    setTimeout(() => {
                        highlightAnswer(gameState.currentCorrectCard.poetId, true);
                        
                        // الانتقال إلى الجولة التالية بعد فترة قصيرة
                        setTimeout(() => {
                            startNewRound();
                        }, 1500);
                    }, 1000);
                } else {
                    // إذا أخطأ الذكاء الاصطناعي، يحصل اللاعب على النقطة مباشرة
                    gameState.playerScore++;
                    updateScore();
                    
                    // تمييز الإجابة الخاطئة للذكاء الاصطناعي
                    highlightAnswer(poetId, false);
                    
                    // تمييز الإجابة الصحيحة بعد فترة قصيرة
                    setTimeout(() => {
                        highlightAnswer(gameState.currentCorrectCard.poetId, true);
                        
                        // الانتقال إلى الجولة التالية بعد فترة قصيرة
                        setTimeout(() => {
                            startNewRound();
                        }, 1500);
                    }, 1000);
                }
            }
        }
        
        // تعطيل جميع بطاقات الشعراء بعد الإجابة (محاولة واحدة فقط)
        disableAllPoetCards();
    }

    // دالة لتعطيل جميع بطاقات الشعراء
    function disableAllPoetCards() {
        const poetCards = document.querySelectorAll(".poet-card");
        poetCards.forEach(card => {
            // إزالة مستمع الحدث
            card.replaceWith(card.cloneNode(true));
            // إضافة فئة للإشارة إلى أن البطاقة معطلة
            card.classList.add("disabled");
        });
    }

    function highlightAnswer(poetId, isCorrect) {
        const poetCards = document.querySelectorAll(".poet-card");
        poetCards.forEach(card => {
            if (card.dataset.poetId === poetId) {
                if (isCorrect) {
                    card.classList.add("correct-answer");
                } else {
                    card.classList.add("wrong-answer");
                }
            }
        });
    }

    function updateScore() {
        const playerScoreElement = document.querySelector(".score-section:first-child .score-value");
        const aiScoreElement = document.querySelector(".score-section:last-child .score-value");
        
        if (playerScoreElement) playerScoreElement.textContent = gameState.playerScore;
        if (aiScoreElement) aiScoreElement.textContent = gameState.aiScore;
    }

    function aiTurn() {
        // تحديد مستوى صعوبة الذكاء الاصطناعي (تم إضعافه)
        let aiAccuracy, aiDelay;
        
        switch (gameState.difficulty) {
            case "easy":
                aiAccuracy = 0.25; // 25% فرصة للإجابة الصحيحة (أضعف من قبل)
                aiDelay = Math.random() * 4000 + 4000; // 4-8 ثوان (أبطأ من قبل)
                break;
            case "medium":
                aiAccuracy = 0.45; // 45% فرصة للإجابة الصحيحة (أضعف من قبل)
                aiDelay = Math.random() * 3000 + 3000; // 3-6 ثوان (أبطأ من قبل)
                break;
            case "hard":
                aiAccuracy = 0.65; // 65% فرصة للإجابة الصحيحة (أضعف من قبل)
                aiDelay = Math.random() * 2000 + 2000; // 2-4 ثوان (أبطأ من قبل)
                break;
            default:
                aiAccuracy = 0.25;
                aiDelay = 4000;
        }
        
        // تحديد ما إذا كان الذكاء الاصطناعي سيجيب إجابة صحيحة
        const willAnswerCorrectly = Math.random() < aiAccuracy;
        
        // تأخير استجابة الذكاء الاصطناعي
        gameState.aiTimeoutId = setTimeout(() => {
            if (willAnswerCorrectly) {
                // الذكاء الاصطناعي يختار الإجابة الصحيحة
                handleAnswer(gameState.currentCorrectCard.poetId, "ai");
            } else {
                // الذكاء الاصطناعي يختار إجابة خاطئة
                // اختيار شاعر عشوائي غير الشاعر الصحيح
                const availablePoets = gameState.selectedCards.filter(card => 
                    card.poetId !== gameState.currentCorrectCard.poetId && !card.collected
                );
                
                if (availablePoets.length > 0) {
                    const randomPoet = availablePoets[Math.floor(Math.random() * availablePoets.length)];
                    handleAnswer(randomPoet.poetId, "ai");
                } else {
                    // لا توجد خيارات متاحة، الانتقال إلى الجولة التالية
                    startNewRound();
                }
            }
        }, aiDelay);
    }

    function showResult() {
        gameState.currentScreen = "result";
        gameState.stats.completedRounds++;
        
        if (gameState.playerScore > gameState.aiScore) {
            gameState.stats.wonRounds++;
        }
        
        // حساب متوسط وقت الاستجابة
        const avgResponseTime = gameState.stats.totalResponses > 0 
            ? Math.round(gameState.stats.totalResponseTime / gameState.stats.totalResponses) 
            : 0;
        
        // تحديد رسالة النتيجة التحفيزية
        let resultMessage;
        let resultClass = "";
        
        if (gameState.playerScore >= 5) {
            // اللاعب فاز بالوصول إلى 5 نقاط
            resultMessage = "🎉 مبروك! لقد فزت على الذكاء الاصطناعي! 🎉<br>أنت تملك معرفة رائعة بالشعر العربي!";
            resultClass = "victory";
            if (winSound) winSound.play().catch(e => console.log("Could not play win sound:", e));
        } else if (gameState.aiScore >= 5) {
            // الذكاء الاصطناعي فاز بالوصول إلى 5 نقاط
            resultMessage = "😔 للأسف، لقد فاز عليك الذكاء الاصطناعي هذه المرة.<br>لا تيأس! حاول مرة أخرى وستتحسن أكثر! 💪";
            resultClass = "defeat";
            if (loseSound) loseSound.play().catch(e => console.log("Could not play lose sound:", e));
        } else if (gameState.playerScore > gameState.aiScore) {
            // اللاعب فاز بنقاط أكثر (في حالة انتهاء البطاقات)
            resultMessage = "🎊 ممتاز! لقد فزت على الذكاء الاصطناعي! 🎊<br>معرفتك بالشعر العربي رائعة!";
            resultClass = "victory";
            if (winSound) winSound.play().catch(e => console.log("Could not play win sound:", e));
        } else if (gameState.playerScore < gameState.aiScore) {
            // الذكاء الاصطناعي فاز بنقاط أكثر
            resultMessage = "😞 للأسف، لقد فاز عليك الذكاء الاصطناعي.<br>استمر في التعلم وستصبح أفضل! 📚";
            resultClass = "defeat";
            if (loseSound) loseSound.play().catch(e => console.log("Could not play lose sound:", e));
        } else {
            // تعادل
            resultMessage = "🤝 تعادل رائع! أنت والذكاء الاصطناعي متساويان في المعرفة.<br>هذا إنجاز ممتاز! 👏";
            resultClass = "tie";
        }
        
        // إنشاء HTML لشاشة النتيجة
        const resultHTML = `
            <div class="result-screen ${resultClass}">
                <h2>نتيجة اللعبة</h2>
                <div class="result-details">
                    <div class="final-score">
                        <div class="score-section">
                            <div class="score-label">أنت</div>
                            <div class="score-value">${gameState.playerScore}</div>
                        </div>
                        <div class="score-section">
                            <div class="score-label">الذكاء الاصطناعي</div>
                            <div class="score-value">${gameState.aiScore}</div>
                        </div>
                    </div>
                    <div class="result-message">${resultMessage}</div>
                </div>
                <div class="result-actions">
                    <button class="play-again-btn">العب مرة أخرى</button>
                    <button class="main-menu-btn">القائمة الرئيسية</button>
                </div>
            </div>
        `;
        
        container.innerHTML = resultHTML;
        addEventListenersToCurrentScreen();
        
        // حفظ الإحصائيات
        saveStats();
    }

    // --- Stats Functions ---
    function showStats() {
        gameState.currentScreen = "stats";
        
        // حساب متوسط وقت الاستجابة
        const avgResponseTime = gameState.stats.totalResponses > 0 
            ? Math.round(gameState.stats.totalResponseTime / gameState.stats.totalResponses) 
            : 0;
        
        // إنشاء HTML لشاشة الإحصائيات
        const statsHTML = `
            <div class="stats-screen">
                <div class="stats-header">
                    <button class="back-btn">العودة للقائمة</button>
                    <h2>الإحصائيات</h2>
                </div>
                <div class="stats-content">
                    <div class="stat-item">
                        <div class="stat-label">عدد الجولات المكتملة:</div>
                        <div class="stat-value">${gameState.stats.completedRounds}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">عدد الجولات المربوحة:</div>
                        <div class="stat-value">${gameState.stats.wonRounds}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">نسبة الفوز:</div>
                        <div class="stat-value">${gameState.stats.completedRounds > 0 ? Math.round((gameState.stats.wonRounds / gameState.stats.completedRounds) * 100) : 0}%</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">أفضل وقت استجابة:</div>
                        <div class="stat-value">${gameState.stats.bestResponseTime} ثانية</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">متوسط وقت الاستجابة:</div>
                        <div class="stat-value">${avgResponseTime} ثانية</div>
                    </div>
                </div>
                <div class="stats-actions">
                    <button class="reset-stats-btn">إعادة تعيين الإحصائيات</button>
                </div>
            </div>
        `;
        
        container.innerHTML = statsHTML;
        addEventListenersToCurrentScreen();
    }

    function resetStats() {
        // إعادة تعيين الإحصائيات
        gameState.stats = {
            completedRounds: 0,
            wonRounds: 0,
            bestResponseTime: 0,
            totalResponseTime: 0,
            totalResponses: 0
        };
        
        // حفظ الإحصائيات المعاد تعيينها
        saveStats();
        
        // تحديث عرض الإحصائيات
        showStats();
    }

    function saveStats() {
        try {
            localStorage.setItem("poetryGameStats", JSON.stringify(gameState.stats));
        } catch (e) {
            console.error("Failed to save stats to localStorage:", e);
        }
    }

    function loadStats() {
        try {
            const savedStats = localStorage.getItem("poetryGameStats");
            if (savedStats) {
                gameState.stats = JSON.parse(savedStats);
            }
        } catch (e) {
            console.error("Failed to load stats from localStorage:", e);
        }
    }

    // --- Instructions Screen ---
    function showInstructions() {
        gameState.currentScreen = "instructions";
        
        // إنشاء HTML لشاشة التعليمات
        const instructionsHTML = `
            <div class="instructions-screen">
                <div class="instructions-header">
                    <button class="back-btn">العودة للقائمة</button>
                    <h2>تعليمات اللعبة</h2>
                </div>
                <div class="instructions-content">
                    <div class="instruction-section">
                        <h3>مرحلة الحفظ (60 ثانية)</h3>
                        <p>ستظهر أمامك 15 بطاقة، كل بطاقة تحتوي على بيت شعر واسم الشاعر الذي قاله.</p>
                        <p>لديك 60 ثانية لحفظ أكبر قدر ممكن من البطاقات.</p>
                        <p>يمكنك الضغط على أي بطاقة لتكبيرها ورؤيتها بوضوح أكبر.</p>
                    </div>
                    <div class="instruction-section">
                        <h3>مرحلة التحدي</h3>
                        <p>بعد انتهاء وقت الحفظ، ستظهر أبيات الشعر واحداً تلو الآخر.</p>
                        <p>عليك اختيار الشاعر الذي قال البيت المعروض.</p>
                        <p>لديك محاولة واحدة فقط لكل بيت شعر.</p>
                        <p>إذا أجبت إجابة خاطئة، يحصل الذكاء الاصطناعي على النقطة.</p>
                        <p>إذا أجاب الذكاء الاصطناعي إجابة خاطئة، تحصل أنت على النقطة.</p>
                    </div>
                    <div class="instruction-section">
                        <h3>مستويات الصعوبة</h3>
                        <p><strong>سهل:</strong> الذكاء الاصطناعي بطيء ودقته منخفضة (40%).</p>
                        <p><strong>متوسط:</strong> الذكاء الاصطناعي متوسط السرعة ودقته متوسطة (60%).</p>
                        <p><strong>صعب:</strong> الذكاء الاصطناعي سريع ودقته عالية (80%).</p>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = instructionsHTML;
        addEventListenersToCurrentScreen();
    }

    // --- Utility Functions ---
    function showLoading() {
        const loadingElement = document.createElement("div");
        loadingElement.className = "loading";
        loadingElement.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">جاري تحميل البيانات...</div>
        `;
        document.body.appendChild(loadingElement);
    }

    function hideLoading() {
        const loadingElement = document.querySelector(".loading");
        if (loadingElement) {
            loadingElement.remove();
        }
    }

    function showError(message) {
        const errorElement = document.createElement("div");
        errorElement.className = "error-message";
        errorElement.textContent = message;
        
        document.body.appendChild(errorElement);
        
        // إخفاء رسالة الخطأ بعد فترة
        setTimeout(() => {
            errorElement.classList.add("fade-out");
            setTimeout(() => {
                if (errorElement.parentNode) {
                    errorElement.parentNode.removeChild(errorElement);
                }
            }, 300);
        }, 3000);
    }

    // تحميل الإحصائيات المحفوظة عند بدء اللعبة
    loadStats();
});
