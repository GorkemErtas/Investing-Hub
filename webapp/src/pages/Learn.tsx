import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChartCandlestick,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import candleGuide from '../assets/images/candlestick-chart-definition.png';
import { Notice } from '../components/ui';

const lessons = [
  {
    title: 'Read the candle, understand the range',
    category: 'MARKET FOUNDATIONS',
    icon: ChartCandlestick,
    duration: '3 min read',
    text: 'A candlestick summarizes an interval: open, high, low and close. Its body runs from open to close; the wicks show the extremes. Volume counts the base asset traded. A forming candle can still change. Compare completed candles over consistent intervals, and remember that a pattern is an observation, not a guarantee.',
    detail:
      'UTC keeps daily boundaries consistent. One calendar month (1M) is different from thirty days; a one-day candle is different from a rolling 24-hour ticker.',
  },
  {
    title: 'Know what your portfolio actually earned',
    category: 'PORTFOLIO ESSENTIALS',
    icon: Wallet,
    duration: '4 min read',
    text: 'Weighted average cost divides the remaining purchase cost, including buy fees, by the remaining units. A sale removes units at that average cost. Realized profit is sale proceeds minus sell fees and the cost of units sold. Unrealized profit compares the value of open holdings with their remaining cost.',
    detail:
      'Example: buy 2 units at 100 and 1 at 160. Cost is 360; average is 120. Sell 1 at 150: realized profit is 30 before fees, remaining cost is 240. Sale proceeds do not reduce average purchase cost.',
  },
  {
    title: 'Treat a backtest as a question',
    category: 'RESEARCH & RISK',
    icon: ShieldCheck,
    duration: '3 min read',
    text: 'A model must be tested on data it has never seen. Splitting randomly can leak the future into the past. Fit transformations on training data only, compare against a simple baseline and report weak results as honestly as strong ones. Historical accuracy does not establish future reliability.',
    detail:
      'Direction and price error answer different questions. A strategy also needs spread, fees, slippage and a feasible execution time. This demo publishes no trading strategy or reliable forecasting claim.',
  },
];
const questions = [
  {
    question:
      'You buy 2 units at 100 USDT and 1 at 160 USDT. What is your average cost before fees?',
    options: ['120 USDT', '130 USDT', '150 USDT'],
    answer: 0,
    why: 'Total cost is 360 USDT divided by 3 units: 120 USDT. Weight each purchase by quantity.',
  },
  {
    question: 'Which candle can still change?',
    options: [
      'A candle that closed yesterday',
      'The current interval’s forming candle',
      'Every completed candle',
    ],
    answer: 1,
    why: 'The forming candle continues to incorporate trades until its close time. Completed candles are used by the research pipeline.',
  },
  {
    question: 'What is the safest way to evaluate a one-day forecasting model?',
    options: [
      'Shuffle all days randomly',
      'Select the best test score repeatedly',
      'Keep the final chronological test set untouched',
    ],
    answer: 2,
    why: 'The final test estimates performance on unseen future periods. Choosing a model by test score contaminates that estimate.',
  },
];
export function Learn() {
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
          <div className="eyebrow">INVEST IN YOUR UNDERSTANDING</div>
          <h1>
            The Learning Hub<span className="heading-dot">.</span>
          </h1>
          <p>Build your foundations, one clear idea at a time.</p>
        </div>
        <span className="pill">
          <BookOpen size={15} />
          Always learning
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
            <span className="eyebrow">{l.category}</span>
            <h2>{l.title}</h2>
            <span className="lesson-bottom">
              {l.duration}
              <ArrowRight size={18} />
            </span>
          </button>
        ))}
      </div>
      <div className="learn-layout">
        <article className="panel lesson-content">
          <span className="eyebrow">{current.category}</span>
          <h2>{current.title}</h2>
          <p>{current.text}</p>
          <div className="lesson-callout">{current.detail}</div>
          {lesson === 0 && (
            <figure>
              <img
                src={candleGuide}
                alt="Candlestick diagram showing a candle’s body, open, close, high, and low"
              />
              <figcaption>
                Historical educational illustration retained from the original university project.
              </figcaption>
            </figure>
          )}
          <Notice>
            Educational examples are illustrative. Crypto assets can lose value; technical patterns
            do not guarantee an outcome.
          </Notice>
        </article>
        <section className="panel quiz" aria-labelledby="quiz-title">
          <div className="eyebrow">PUT IT INTO PRACTICE</div>
          <h2 id="quiz-title">A quick knowledge check</h2>
          {finished ? (
            <div className="quiz-finished" role="status">
              <CheckCircle2 size={36} />
              <h3>
                {score} of {questions.length} correct
              </h3>
              <p>Keep asking good questions.</p>
              <button
                className="button primary"
                onClick={() => {
                  setQuestion(0);
                  setChoice(null);
                  setScore(0);
                  setFinished(false);
                }}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="quiz-progress">
                <span style={{ width: `${((question + 1) / questions.length) * 100}%` }} />
              </div>
              <p className="muted">
                Question {question + 1} of {questions.length}
              </p>
              <h3>{q.question}</h3>
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
                    {option}
                  </button>
                ))}
              </div>
              {choice !== null && (
                <div className="quiz-explanation" role="status">
                  <strong>{choice === q.answer ? 'Correct.' : 'A useful thing to revisit.'}</strong>
                  <p>{q.why}</p>
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
                    {question === questions.length - 1 ? 'See results' : 'Next question'}
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
