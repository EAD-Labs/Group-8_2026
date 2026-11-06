import { useEffect, useState, type ReactNode } from "react";
import {
  Cpu,
  Database,
  Download,
  Gauge,
  Languages,
  MessageCircleQuestion,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  Trash2,
  Volume2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ROOMS } from "@/components/classroom/personas";
import { LANGS, useI18n, type Key, type LangCode } from "@/lib/i18n";
import { resolveQuality, useSettings, type Settings } from "@/lib/settings";
import { clockOffsetDays, onClockChange, resetClock, skipDays } from "@/lib/clock";

type Seg<T extends string | number> = { value: T; label: string; icon?: ReactNode };

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<Seg<T>>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({
  title,
  help,
  children,
  id,
}: {
  title: string;
  help?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong id={id}>{title}</strong>
        {help && <small>{help}</small>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="settings-card">
      <h2>
        <span>{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export type SettingsActions = {
  onExport: () => void;
  onResetProgress: () => void;
  onClearMaterials: () => void;
  onClearTranslations: () => void;
  onStartJourney: () => void;
  onOpenKnowledge: () => void;
  onOpenStudy: () => void;
  onOpenEvaluation: () => void;
  translating: boolean;
  note: string;
};

export function SettingsPanel({ actions }: { actions: SettingsActions }) {
  const { t, lang, setLang } = useI18n();
  const { settings: s, update, reset, quality } = useSettings();
  const [ai, setAi] = useState<string | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<
    null | "progress" | "materials" | "translations" | "settings"
  >(null);
  const [done, setDone] = useState("");
  const [days, setDays] = useState(clockOffsetDays());
  useEffect(() => {
    const off = onClockChange(() => setDays(clockOffsetDays()));
    return () => void off();
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((d: { ai?: string | null }) => live && setAi(d.ai ?? null))
      .catch(() => live && setAi(null));
    return () => {
      live = false;
    };
  }, []);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    update({ [k]: v } as Partial<Settings>);
  const run = (what: NonNullable<typeof confirm>) => {
    if (what === "progress") actions.onResetProgress();
    if (what === "materials") actions.onClearMaterials();
    if (what === "translations") actions.onClearTranslations();
    if (what === "settings") reset();
    setConfirm(null);
    setDone(t("settings.done"));
    window.setTimeout(() => setDone(""), 2500);
  };
  const danger = (what: NonNullable<typeof confirm>, label: string, icon: ReactNode) =>
    confirm === what ? (
      <div className="confirm-box" role="alertdialog" aria-label={label}>
        <span>{t("settings.confirm")}</span>
        <button type="button" className="danger" onClick={() => run(what)}>
          {t("settings.yes")}
        </button>
        <button type="button" onClick={() => setConfirm(null)}>
          {t("settings.cancel")}
        </button>
      </div>
    ) : (
      <button type="button" className="setting-btn" onClick={() => setConfirm(what)}>
        {icon} {label}
      </button>
    );

  return (
    <section className="page-view settings-page">
      <div className="page-title">
        <div>
          <small>{t("nav.settings").toUpperCase()}</small>
          <h1>{t("settings.title")}</h1>
          <p>{t("settings.subtitle")}</p>
        </div>
        {done && (
          <span className="saved-chip" role="status">
            {done}
          </span>
        )}
      </div>
      <div className="settings-grid">
        <Card icon={<Palette />} title={t("settings.appearance")}>
          <Row title={t("settings.theme")} help={t("settings.themeHelp")}>
            <Segmented
              label={t("settings.theme")}
              value={s.theme}
              onChange={(v) => set("theme", v)}
              options={[
                { value: "system", label: t("theme.system"), icon: <Monitor /> },
                { value: "light", label: t("theme.light"), icon: <Sun /> },
                { value: "dark", label: t("theme.dark"), icon: <Moon /> },
              ]}
            />
          </Row>
          <Row title={t("settings.motion")} help={t("settings.motionHelp")}>
            <Segmented
              label={t("settings.motion")}
              value={s.motion}
              onChange={(v) => set("motion", v)}
              options={[
                { value: "system", label: t("motion.system") },
                { value: "on", label: t("motion.on") },
                { value: "off", label: t("motion.off") },
              ]}
            />
          </Row>
        </Card>

        <Card icon={<Languages />} title={t("settings.language")}>
          <Row title={t("settings.language")} help={t("settings.languageHelp")}>
            <select
              className="setting-select"
              aria-label={t("settings.language")}
              value={lang}
              onChange={(e) => setLang(e.target.value as LangCode)}
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>
                  {l.native}
                </option>
              ))}
            </select>
          </Row>
          {(actions.translating || actions.note) && (
            <p
              className={`voice-note ${actions.note && !actions.translating ? "error" : ""}`}
              role="status"
            >
              {actions.translating ? t("lang.translating") : actions.note}
            </p>
          )}
        </Card>

        <Card icon={<Monitor />} title={t("settings.classroom")}>
          <div className="room-choices" role="radiogroup" aria-label={t("settings.classroom")}>
            <button
              type="button"
              role="radio"
              aria-checked={s.room === "auto"}
              className={`room-choice ${s.room === "auto" ? "on" : ""}`}
              onClick={() => set("room", "auto")}
            >
              <span className="room-thumb auto" aria-hidden />
              <b>{t("room.auto")}</b>
              <small>{t("room.autoHelp")}</small>
            </button>
            {ROOMS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={s.room === r.id}
                className={`room-choice ${s.room === r.id ? "on" : ""}`}
                onClick={() => set("room", r.id)}
              >
                <span className="room-thumb" aria-hidden>
                  <img
                    src={`/rooms/${r.id}.jpg`}
                    alt=""
                    loading="lazy"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </span>
                <b>{t(`room.${r.id}` as Key)}</b>
                <small>{r.teacher.name}</small>
              </button>
            ))}
          </div>
          <Row title={t("settings.startEnlarged")} help={t("settings.startEnlargedHelp")}>
            <Switch
              checked={s.startEnlarged}
              onCheckedChange={(v) => set("startEnlarged", v)}
              aria-label={t("settings.startEnlarged")}
            />
          </Row>
          <Row title={t("settings.nameTags")}>
            <Switch
              checked={s.nameTags}
              onCheckedChange={(v) => set("nameTags", v)}
              aria-label={t("settings.nameTags")}
            />
          </Row>
          <Row title={t("settings.transcript")}>
            <Switch
              checked={s.showTranscript}
              onCheckedChange={(v) => set("showTranscript", v)}
              aria-label={t("settings.transcript")}
            />
          </Row>
        </Card>

        <Card icon={<Volume2 />} title={t("settings.voice")}>
          <Row title={t("settings.narration")} help={t("settings.narrationHelp")}>
            <Switch
              checked={s.voiceOn}
              onCheckedChange={(v) => set("voiceOn", v)}
              aria-label={t("settings.narration")}
            />
          </Row>
          <Row title={t("settings.speed")}>
            <Segmented
              label={t("settings.speed")}
              value={s.speed}
              onChange={(v) => set("speed", v)}
              options={[
                { value: 1, label: "1×" },
                { value: 1.5, label: "1.5×" },
                { value: 2, label: "2×" },
              ]}
            />
          </Row>
        </Card>

        <Card icon={<MessageCircleQuestion />} title={t("settings.questions")}>
          <Row title={t("settings.popup")} help={t("settings.popupHelp")}>
            <Switch
              checked={s.popupQuestions}
              onCheckedChange={(v) => set("popupQuestions", v)}
              aria-label={t("settings.popup")}
            />
          </Row>
          <Row
            title="Hands-free class (voice)"
            help="The teacher asks out loud and you answer out loud — quizzes, check-ins and questions included. Say “pause”, “repeat”, “next”, “go back”, or “I have a doubt…” whenever the teacher pauses. Needs Chrome or Edge and a microphone."
          >
            <Switch
              checked={s.handsFree}
              onCheckedChange={(v) => set("handsFree", v)}
              aria-label="Hands-free class (voice)"
            />
          </Row>
          <Row
            title="Lesson depth"
            help="Full: the AI teaches the topic in depth, the way it would in a chat, inside the class. Brief: the short verified version (also used when the AI is not available)."
          >
            <Segmented
              label="Lesson depth"
              value={s.lessonDepth}
              onChange={(v) => set("lessonDepth", v)}
              options={[
                { value: "full", label: "Full" },
                { value: "brief", label: "Brief" },
              ]}
            />
          </Row>
          <Row
            title="Play the class automatically"
            help="The class moves on by itself, at reading pace, and stops only where you need to answer. Space or K pauses it."
          >
            <Switch
              checked={s.autoPlay}
              onCheckedChange={(v) => set("autoPlay", v)}
              aria-label="Play the class automatically"
            />
          </Row>
          <Row
            title="Thinking check-ins"
            help="Three short one-tap questions during a class — what you know before, whether it is making sense, how sure you are after. Always skippable."
          >
            <Switch
              checked={s.thinkingCheckins}
              onCheckedChange={(v) => set("thinkingCheckins", v)}
              aria-label="Thinking check-ins"
            />
          </Row>
          <Row title={t("settings.reviewGoal")}>
            <Segmented
              label={t("settings.reviewGoal")}
              value={s.reviewGoal}
              onChange={(v) => set("reviewGoal", v)}
              options={[5, 10, 15, 20].map((n) => ({
                value: n as Settings["reviewGoal"],
                label: String(n),
              }))}
            />
          </Row>
        </Card>

        <Card icon={<Gauge />} title={t("settings.graphics")}>
          <Row
            title={t("settings.graphics")}
            help={t("settings.graphicsHelp", { level: t(`graphics.${quality}` as Key) })}
          >
            <Segmented
              label={t("settings.graphics")}
              value={s.graphics}
              onChange={(v) => set("graphics", v)}
              options={(["auto", "low", "medium", "high"] as const).map((g) => ({
                value: g,
                label: t(`graphics.${g}` as Key),
              }))}
            />
          </Row>
          <Row title={t("settings.effects")} help={t("settings.effectsHelp")}>
            <Switch
              checked={s.effects}
              onCheckedChange={(v) => set("effects", v)}
              aria-label={t("settings.effects")}
            />
          </Row>
        </Card>

        <Card icon={<Cpu />} title="Demo & evaluation">
          <Row
            title="Guided user journey"
            help="A step-by-step checklist that follows what you actually do, from picking a topic to the delayed retention quiz."
          >
            <button type="button" className="setting-btn" onClick={actions.onStartJourney}>
              Start the guided demo
            </button>
          </Row>
          <Row
            title="Verified knowledge"
            help="See each topic's verified record: who produced it, what was corrected or disputed, and how it was settled."
          >
            <button type="button" className="setting-btn" onClick={actions.onOpenKnowledge}>
              Open records
            </button>
          </Row>
          <Row
            title="Comparative study"
            help="Learn one concept in the classroom and a matched one in plain chat; both are tested days later (HLD §6.3)."
          >
            <div className="seg">
              <button type="button" onClick={actions.onOpenStudy}>
                Join / continue
              </button>
              <button type="button" onClick={actions.onOpenEvaluation}>
                Evaluation report
              </button>
            </div>
          </Row>
          <Row
            title={`Demo clock (+${days} day${days === 1 ? "" : "s"})`}
            help="Retention checks return days after learning. Fast-forward to show one in a live demo. This only shifts how the app reads the date."
          >
            <div className="seg">
              <button type="button" onClick={() => skipDays(1)}>
                +1 day
              </button>
              <button type="button" onClick={() => skipDays(3)}>
                +3 days
              </button>
              <button type="button" onClick={() => skipDays(5)}>
                +5 days
              </button>
              <button type="button" onClick={resetClock}>
                Reset
              </button>
            </div>
          </Row>
        </Card>

        <Card icon={<Database />} title={t("settings.data")}>
          <Row title={t("settings.aiStatus")}>
            <span className={`ai-chip ${ai ? "on" : ""}`} role="status">
              <Cpu />{" "}
              {ai === undefined
                ? t("ai.checking")
                : ai
                  ? t("ai.on", { provider: ai === "anthropic" ? "Claude" : "Lovable AI" })
                  : t("ai.off")}
            </span>
          </Row>
          <Row title={t("settings.export")} help={t("settings.exportHelp")}>
            <button type="button" className="setting-btn" onClick={actions.onExport}>
              <Download /> {t("settings.export")}
            </button>
          </Row>
          <div className="danger-zone">
            {danger("progress", t("settings.resetProgress"), <RotateCcw />)}
            {danger("materials", t("settings.clearMaterials"), <Trash2 />)}
            {danger("translations", t("settings.clearTranslations"), <Languages />)}
            {danger("settings", t("settings.resetSettings"), <RotateCcw />)}
          </div>
        </Card>
      </div>
    </section>
  );
}

export { resolveQuality };
