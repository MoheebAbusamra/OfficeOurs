// [S2] Hand-drawn student thinking, hand on chin, question marks floating around the head (decorative, same style as the password student)
export default function ThinkingStudent({ size = 132 }) {
  return (
    <svg className="thinking" viewBox="0 0 150 130" width={size} height={size * 130 / 150} aria-hidden="true">
      {/* body + shoulders */}
      <path d="M30 128c4-24 22-34 45-34s41 10 45 34" className="ts-body" />
      {/* head */}
      <circle cx="72" cy="62" r="27" className="ts-face" />
      {/* graduation cap + tassel */}
      <path d="M40 40 72 27l32 13-32 13Z" className="ts-cap" />
      <path d="M58 47v9q14 6 28 0v-9" className="ts-cap" />
      <path d="M100 42v15" className="ts-tassel" />
      <circle cx="100" cy="59" r="2.6" className="ts-tassel-end" />
      {/* eyes looking up and to the side, one raised brow */}
      <ellipse cx="63" cy="63" rx="2.4" ry="3" className="ts-eye" />
      <ellipse cx="81" cy="62" rx="2.4" ry="3" className="ts-eye" />
      <path d="M57 55q5-3 10-1M76 53q5-5 11-2" className="ts-line" />
      {/* "hmm" mouth */}
      <path d="M65 76q5-2 11 1" className="ts-line" />
      {/* hand on chin */}
      <path d="M88 98c-3-9 0-15 6-16 5-1 8 3 7 7l-2 6c-1 4-6 6-11 3Z" className="ts-hand" />
      <path d="M90 84q-4-4-2-8" className="ts-line" />
      {/* question marks */}
      <text x="114" y="34" className="ts-q ts-q1">?</text>
      <text x="16" y="44" className="ts-q ts-q2">?</text>
      <text x="124" y="74" className="ts-q ts-q3">?</text>
    </svg>
  );
}
