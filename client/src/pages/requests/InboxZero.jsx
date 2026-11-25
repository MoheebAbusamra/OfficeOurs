// [S2] "Inbox zero" illustration: a hand-drawn mug with rising steam on a saucer (decorative)
export default function InboxZero({ size = 150 }) {
  return (
    <svg className="inbox-zero" viewBox="0 0 160 140" width={size} height={size * 140 / 160} aria-hidden="true">
      {/* steam */}
      <path d="M58 44c-6-8 6-12 0-22" className="iz-steam" />
      <path d="M74 40c-6-9 7-13 0-24" className="iz-steam iz-steam-2" />
      <path d="M90 44c-6-8 6-12 0-22" className="iz-steam iz-steam-3" />
      {/* saucer */}
      <ellipse cx="78" cy="118" rx="58" ry="10" className="iz-saucer" />
      {/* handle */}
      <path d="M112 72c18-2 22 22 2 26" className="iz-handle" />
      {/* mug */}
      <path d="M40 56h76l-6 52c-1 6-6 10-12 10H58c-6 0-11-4-12-10Z" className="iz-mug" />
      <path d="M41 56c8 6 66 6 74 0" className="iz-rim" />
      {/* label on the mug: a little notebook mark */}
      <rect x="64" y="74" width="28" height="24" rx="5" className="iz-label" />
      <path d="M70 82h16M70 89h10" className="iz-lines" />
      {/* sparkle */}
      <path d="M130 30v10M125 35h10" className="iz-spark" />
      <path d="M26 74v8M22 78h8" className="iz-spark iz-spark-2" />
    </svg>
  );
}
