/**
 * Words lift out of a soft blur and settle, once. CSS only, so the headline is in the server HTML at rest
 * state when scripting is off, has a plain accessible name, and needs no hydration to appear.
 * Adapted from "Blur Out Up" by educalvolpz on 21st.dev (21st.dev/@educalvolpz/components/blur-out-up):
 * same blur + rise per word; 40ms stagger on the project curve (keyframes and reduced motion in minimal.css).
 */
export function BlurOutUp({ children, delayMs = 0 }: { children: string; delayMs?: number }) {
  const words = children.split(" ");
  return (
    <>
      {words.map((word, i) => (
        <span key={`${word}-${i}`}>
          <span className="m-word" style={{ animationDelay: `${delayMs + i * 40}ms` }}>
            {word}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}
