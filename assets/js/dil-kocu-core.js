(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.DilKocuCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DEFAULT_GOAL = 10;
    const MAX_GOAL = 500;
    const MAX_QUIZ_QUESTIONS = 20;
    const MAX_RESPONSE_TOKENS = 6500;

    function normalizeGoal(value, fallback = DEFAULT_GOAL) {
        const parsed = Number.parseInt(value, 10);
        const safeFallback = Number.parseInt(fallback, 10) || DEFAULT_GOAL;
        if (!Number.isFinite(parsed) || parsed < 1) return safeFallback;
        return Math.min(parsed, MAX_GOAL);
    }

    function getLessonBatchSize(goalValue, remainingValue) {
        const goal = normalizeGoal(goalValue);
        const parsedRemaining = Number.parseInt(remainingValue, 10);
        const remaining = Number.isFinite(parsedRemaining)
            ? Math.max(0, Math.min(parsedRemaining, goal))
            : goal;
        if (remaining === 0) return 0;

        const batchLimit = goal <= 10 ? goal : goal <= 30 ? 10 : goal <= 60 ? 15 : 20;
        return Math.min(batchLimit, remaining);
    }

    function getQuizQuestionCount(goalValue) {
        const goal = normalizeGoal(goalValue);
        const scaledCount = Math.max(5, Math.ceil(goal / 3));
        return Math.min(goal, MAX_QUIZ_QUESTIONS, scaledCount);
    }

    function getResponseTokenBudget(options) {
        const config = options || {};
        const goal = normalizeGoal(config.goal);
        if (config.quizActive) {
            const questionCount = getQuizQuestionCount(goal);
            return Math.min(4000, Math.max(2500, 1400 + (questionCount * 130)));
        }

        const batchSize = getLessonBatchSize(goal, config.remaining);
        if (batchSize === 0) return 4000;
        return Math.min(MAX_RESPONSE_TOKENS, Math.max(4000, 1800 + (batchSize * 280)));
    }

    function countLearnedMarkers(responseText) {
        const matches = String(responseText || '').match(/\[KELİME ÖĞRENİLDİ\s*✅?\]/giu);
        return matches ? matches.length : 0;
    }

    function applyProgressDelta(currentValue, deltaValue, goalValue) {
        const goal = normalizeGoal(goalValue);
        const current = Math.max(0, Math.min(Number.parseInt(currentValue, 10) || 0, goal));
        const delta = Math.max(0, Number.parseInt(deltaValue, 10) || 0);
        const count = Math.min(goal, current + delta);
        return {
            previous: current,
            count,
            added: count - current,
            reachedGoal: current < goal && count >= goal
        };
    }

    return {
        DEFAULT_GOAL,
        MAX_GOAL,
        MAX_QUIZ_QUESTIONS,
        MAX_RESPONSE_TOKENS,
        normalizeGoal,
        getLessonBatchSize,
        getQuizQuestionCount,
        getResponseTokenBudget,
        countLearnedMarkers,
        applyProgressDelta
    };
}));
