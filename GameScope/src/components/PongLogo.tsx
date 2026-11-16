import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface PongLogoProps {
  src: string;
}

const CLICKS_TO_LAUNCH = 5;
const CLICK_WINDOW_MS = 1500;
const START_SPEED = 420;
const MAX_SPEED = 900;
const WALL_BOOST = 1.04;
const RETURN_MS = 600;

type PongState = "docked" | "flying" | "returning";

function PongLogo({ src }: PongLogoProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLButtonElement>(null);
  const clickCount = useRef(0);
  const lastClick = useRef(0);
  const frame = useRef(0);
  const returnTimer = useRef(0);
  const motion = useRef({ x: 0, y: 0, vx: 0, vy: 0, last: 0 });
  const [state, setState] = useState<PongState>("docked");

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      window.clearTimeout(returnTimer.current);
    },
    []
  );

  useLayoutEffect(() => {
    const ball = ballRef.current;
    const slot = slotRef.current;
    if (!ball || !slot) return;

    if (state === "flying") {
      const move = motion.current;
      ball.style.transition = "none";
      ball.style.transform = `translate(${move.x}px, ${move.y}px)`;

      const step = (now: number) => {
        const dt = Math.min((now - move.last) / 1000, 0.05);
        move.last = now;

        const size = ball.offsetWidth;
        const maxX = Math.max(window.innerWidth - size, 0);
        const maxY = Math.max(window.innerHeight - size, 0);

        move.x += move.vx * dt;
        move.y += move.vy * dt;

        if (move.x <= 0) {
          move.x = 0;
          move.vx = Math.abs(move.vx) * WALL_BOOST;
        } else if (move.x >= maxX) {
          move.x = maxX;
          move.vx = -Math.abs(move.vx) * WALL_BOOST;
        }

        if (move.y <= 0) {
          move.y = 0;
          move.vy = Math.abs(move.vy) * WALL_BOOST;
        } else if (move.y >= maxY) {
          move.y = maxY;
          move.vy = -Math.abs(move.vy) * WALL_BOOST;
        }

        const speed = Math.hypot(move.vx, move.vy);
        if (speed > MAX_SPEED) {
          move.vx *= MAX_SPEED / speed;
          move.vy *= MAX_SPEED / speed;
        }

        ball.style.transform = `translate(${move.x}px, ${move.y}px)`;
        frame.current = requestAnimationFrame(step);
      };

      frame.current = requestAnimationFrame(step);
      return () => cancelAnimationFrame(frame.current);
    }

    if (state === "returning") {
      const home = slot.getBoundingClientRect();
      ball.style.transition = `transform ${RETURN_MS}ms cubic-bezier(0.34, 1.4, 0.64, 1)`;
      ball.style.transform = `translate(${home.left}px, ${home.top}px)`;
      returnTimer.current = window.setTimeout(
        () => setState("docked"),
        RETURN_MS
      );
      return;
    }

    ball.style.transition = "";
    ball.style.transform = "";
  }, [state]);

  const launch = () => {
    const slot = slotRef.current;
    if (!slot) return;

    const home = slot.getBoundingClientRect();
    // A diagonal start so it never gets stuck sliding along one wall
    const angle = ((25 + Math.random() * 40) * Math.PI) / 180;
    const xDirection = Math.random() < 0.5 ? -1 : 1;
    const yDirection = Math.random() < 0.5 ? -1 : 1;

    motion.current = {
      x: home.left,
      y: home.top,
      vx: Math.cos(angle) * START_SPEED * xDirection,
      vy: Math.sin(angle) * START_SPEED * yDirection,
      last: performance.now(),
    };
    setState("flying");
  };

  const handleClick = () => {
    if (state === "flying") {
      cancelAnimationFrame(frame.current);
      setState("returning");
      return;
    }

    if (state === "returning") return;

    const now = Date.now();
    clickCount.current =
      now - lastClick.current < CLICK_WINDOW_MS ? clickCount.current + 1 : 1;
    lastClick.current = now;

    if (clickCount.current < CLICKS_TO_LAUNCH) return;
    clickCount.current = 0;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    launch();
  };

  return (
    <div
      ref={slotRef}
      className={`signin-logo ${state === "docked" ? "" : "pong-empty"}`}
    >
      <button
        ref={ballRef}
        type="button"
        className={`pong-logo ${state === "docked" ? "" : "pong-flying"}`}
        onClick={handleClick}
        aria-label="GameScope logo"
      >
        <img src={src} alt="" />
      </button>
    </div>
  );
}

export default PongLogo;
