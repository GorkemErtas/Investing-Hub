import { i18n } from '../lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChartCandlestick,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { CandleDiagram } from '../components/CandleDiagram';
import { Notice } from '../components/ui';

const lessons = [
  {
    title: 'learn.readTheCandleUnderstandTheRange',
    category: 'learn.marketFoundations',
    icon: ChartCandlestick,
    duration: 'learn.3MinRead',
    text: 'learn.aCandlestickSummarizesAnIntervalOpenHigh',
    detail: 'learn.utcKeepsDailyBoundariesConsistentOneCalendar',
  },
  {
    title: 'learn.knowWhatYourPortfolioActuallyEarned',
    category: 'learn.portfolioEssentials',
    icon: Wallet,
    duration: 'learn.4MinRead',
    text: 'learn.weightedAverageCostDividesTheRemainingPurchase',
    detail: 'learn.exampleBuy2UnitsAt100And',
  },
  {
    title: 'learn.treatABacktestAsAQuestion',
    category: 'learn.researchRisk',
    icon: ShieldCheck,
    duration: 'learn.3MinRead',
    text: 'learn.aModelMustBeTestedOnData',
    detail: 'learn.directionAndPriceErrorAnswerDifferentQuestions',
  },
];
const questions = [
  {
    question: 'learn.youBuy2UnitsAt100Usdt',
    options: ['learn.120Usdt', 'learn.130Usdt', 'learn.150Usdt'],
    answer: 0,
    why: 'learn.totalCostIs360UsdtDividedBy',
  },
  {
    question: 'learn.whichCandleCanStillChange',
    options: [
      'learn.aCandleThatClosedYesterday',
      'learn.theCurrentIntervalSFormingCandle',
      'learn.everyCompletedCandle',
    ],
    answer: 1,
    why: 'learn.theFormingCandleContinuesToIncorporateTrades',
  },
  {
    question: 'learn.whatIsTheSafestWayToEvaluate',
    options: [
      'learn.shuffleAllDaysRandomly',
      'learn.selectTheBestTestScoreRepeatedly',
      'learn.keepTheFinalChronologicalTestSetUntouched',
    ],
    answer: 2,
    why: 'learn.theFinalTestEstimatesPerformanceOnUnseen',
  },
];
export function Learn() {
  useTranslation();
  const [lesson, setLesson] = useState(0);
  const [question, setQuestion] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const current = lessons[lesson],
    q = questions[question];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{i18n.t('learn.investInYourUnderstanding')}</div>
          <h1>
            {i18n.t('learn.theLearningHub')}
            <span className="heading-dot">.</span>
          </h1>
          <p>{i18n.t('learn.buildYourFoundationsOneClearIdeaAt')}</p>
        </div>
        <span className="pill">
          <BookOpen size={15} />
          {i18n.t('learn.alwaysLearning')}
        </span>
      </div>
      <div className="lesson-grid">
        {lessons.map((l, i) => (
          <button
            className={`lesson-card ${lesson === i ? 'active' : ''}`}
            key={l.title}
            onClick={() => setLesson(i)}
            aria-pressed={lesson === i}
          >
            <span className="lesson-icon">
              <l.icon size={24} />
            </span>
            <span className="eyebrow">{i18n.t(l.category)}</span>
            <h2>{i18n.t(l.title)}</h2>
            <span className="lesson-bottom">
              {i18n.t(l.duration)}
              <ArrowRight size={18} />
            </span>
          </button>
        ))}
      </div>
      <div className="learn-layout">
        <article className="panel lesson-content">
          <span className="eyebrow">{i18n.t(current.category)}</span>
          <h2>{i18n.t(current.title)}</h2>
          <p>{i18n.t(current.text)}</p>
          <div className="lesson-callout">{i18n.t(current.detail)}</div>
          {lesson === 0 && (
            <figure>
              <CandleDiagram />
              <figcaption>
                {i18n.t('learn.historicalEducationalIllustrationRetainedFromTheOriginal')}
              </figcaption>
            </figure>
          )}
          <Notice>{i18n.t('learn.educationalExamplesAreIllustrativeCryptoAssetsCan')}</Notice>
        </article>
        <section className="panel quiz" aria-labelledby="quiz-title">
          <div className="eyebrow">{i18n.t('learn.putItIntoPractice')}</div>
          <h2 id="quiz-title">{i18n.t('learn.aQuickKnowledgeCheck')}</h2>
          {finished ? (
            <div className="quiz-finished" role="status">
              <CheckCircle2 size={36} />
              <h3>{i18n.t('learn.score', { score, total: questions.length })}</h3>
              <p>{i18n.t('learn.keepAskingGoodQuestions')}</p>
              <button
                className="button primary"
                onClick={() => {
                  setQuestion(0);
                  setChoice(null);
                  setScore(0);
                  setFinished(false);
                }}
              >
                {i18n.t('common:action.retry')}
              </button>
            </div>
          ) : (
            <>
              <div className="quiz-progress">
                <span style={{ width: `${((question + 1) / questions.length) * 100}%` }} />
              </div>
              <p className="muted">
                {i18n.t('learn.progress', { current: question + 1, total: questions.length })}
              </p>
              <h3>{i18n.t(q.question)}</h3>
              <div className="quiz-options">
                {q.options.map((option, i) => (
                  <button
                    disabled={choice !== null}
                    key={option}
                    className={
                      choice !== null && i === q.answer
                        ? 'correct'
                        : choice === i
                          ? 'incorrect'
                          : ''
                    }
                    onClick={() => {
                      setChoice(i);
                      if (i === q.answer) setScore(score + 1);
                    }}
                  >
                    <span>{String.fromCharCode(65 + i)}</span>
                    {i18n.t(option)}
                  </button>
                ))}
              </div>
              {choice !== null && (
                <div className="quiz-explanation" role="status">
                  <strong>
                    {choice === q.answer
                      ? i18n.t('learn.correctAnswer')
                      : i18n.t('learn.aUsefulThingToRevisit')}
                  </strong>
                  <p>{i18n.t(q.why)}</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (question === questions.length - 1) setFinished(true);
                      else {
                        setQuestion(question + 1);
                        setChoice(null);
                      }
                    }}
                  >
                    {question === questions.length - 1
                      ? i18n.t('learn.seeResults')
                      : i18n.t('learn.nextQuestion')}
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
