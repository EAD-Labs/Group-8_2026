// The front page: what to do today. Lectures scheduled for today, retention quizzes that are due,
// anything left half-way and open doubts — each ticked off by real progress, not by hand.
import {
  BookOpen,
  Brain,
  CalendarCheck,
  Check,
  CircleDot,
  Clock,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Today, TodayLecture } from "@/lib/today";

const greeting = (now: number) => {
  const h = new Date(now).getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const dateLine = (now: number) =>
  new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

function LectureRow({ l, onOpen }: { l: TodayLecture; onOpen: () => void }) {
  return (
    <li className={`today-row ${l.status}`}>
      <span className="today-status" aria-hidden="true">
        {l.status === "done" ? (
          <Check />
        ) : l.status === "in-progress" ? (
          <CircleDot />
        ) : (
          <BookOpen />
        )}
      </span>
      <div className="today-text">
        <b>{l.title}</b>
        <small>
          {l.module} · about {l.minutes} min
          {l.status === "in-progress" && l.at ? ` · stopped at ${l.at} of ${l.total}` : ""}
          {l.status === "done" ? " · understood" : ""}
        </small>
      </div>
      {l.status === "done" ? (
        <span className="today-done">Done</span>
      ) : (
        <Button size="sm" onClick={onOpen}>
          {l.status === "in-progress" ? "Resume" : "Start"}
        </Button>
      )}
    </li>
  );
}

export function TodayPanel({
  today,
  now,
  name,
  points,
  perDay,
  onPerDay,
  onLecture,
  onQuiz,
  onDoubts,
}: {
  today: Today | null;
  now: number;
  name?: string;
  points: number;
  perDay: 1 | 2 | 3;
  onPerDay: (n: 1 | 2 | 3) => void;
  onLecture: (l: TodayLecture) => void;
  onQuiz: (key: string) => void;
  onDoubts: () => void;
}) {
  if (!today) return <div className="today-page" aria-busy="true" />;
  const allDone =
    today.total > 0 && today.done + 0 === today.lectures.length && today.quizzes.length === 0;
  return (
    <div className="today-page">
      <header className="today-head">
        <div>
          <p className="today-eyebrow">
            <CalendarCheck aria-hidden="true" /> {dateLine(now)}
          </p>
          <h1>
            {greeting(now)}
            {name ? `, ${name}` : ""}
          </h1>
          <p className="today-sub">
            {today.total === 0
              ? "Nothing scheduled — you have finished every lecture."
              : allDone
                ? "Everything for today is done. Well done."
                : `${today.done} of ${today.lectures.length} lectures done${today.quizzes.length ? ` · ${today.quizzes.length} quiz${today.quizzes.length === 1 ? "" : "zes"} due` : ""}`}
          </p>
        </div>
        <div className="today-points" title="Points earned by learning (never by time spent)">
          <Sparkles aria-hidden="true" /> {points} points
        </div>
      </header>

      <section className="today-card" aria-labelledby="today-lectures">
        <h2 id="today-lectures">
          <BookOpen aria-hidden="true" /> Lectures for today
        </h2>
        {today.lectures.length ? (
          <ul className="today-list">
            {today.lectures.map((l) => (
              <LectureRow key={l.key} l={l} onOpen={() => onLecture(l)} />
            ))}
          </ul>
        ) : (
          <p className="today-empty">No new lectures left in the course.</p>
        )}
        <div className="today-perday" role="group" aria-label="Lectures per day">
          <span>Lectures per day</span>
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={n === perDay ? "on" : ""}
              aria-pressed={n === perDay}
              onClick={() => onPerDay(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="today-card" aria-labelledby="today-quizzes">
        <h2 id="today-quizzes">
          <RotateCcw aria-hidden="true" /> Retention quizzes due
        </h2>
        {today.quizzes.length ? (
          <ul className="today-list">
            {today.quizzes.map((q) => (
              <li key={q.key} className="today-row todo">
                <span className="today-status quiz" aria-hidden="true">
                  <Clock />
                </span>
                <div className="today-text">
                  <b>{q.title}</b>
                  <small>
                    {q.module} ·{" "}
                    {q.overdueDays > 0
                      ? `overdue by ${q.overdueDays} day${q.overdueDays === 1 ? "" : "s"}`
                      : "due today"}{" "}
                    · a few questions from an earlier lecture
                  </small>
                </div>
                <Button size="sm" onClick={() => onQuiz(q.key)}>
                  Take quiz
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="today-empty">
            No retention quizzes due today. They come back a few days after you pass a lecture's
            checkpoint.
          </p>
        )}
      </section>

      {(today.resume || today.doubts.length > 0) && (
        <section className="today-card" aria-labelledby="today-also">
          <h2 id="today-also">
            <Brain aria-hidden="true" /> Also waiting
          </h2>
          <ul className="today-list">
            {today.resume && (
              <LectureRow l={today.resume} onOpen={() => onLecture(today.resume!)} />
            )}
            {today.doubts.length > 0 && (
              <li className="today-row todo">
                <span className="today-status doubt" aria-hidden="true">
                  <Brain />
                </span>
                <div className="today-text">
                  <b>
                    {today.doubts.length} open doubt{today.doubts.length === 1 ? "" : "s"}
                  </b>
                  <small>{today.doubts.slice(0, 3).join(" · ")}</small>
                </div>
                <Button size="sm" variant="outline" onClick={onDoubts}>
                  See doubts
                </Button>
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
