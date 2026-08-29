/* The settled model's motion — push 240ms / pop 200ms, cubic-bezier(.2,0,0,1),
   cross-fade under reduced motion — expressed as an Ionic AnimationBuilder
   and handed to IonRouterOutlet. This replaces Ionic's platform transition
   with the mock's own, proving the transition is configurable, not imposed. */
import { createAnimation, type Animation } from "@ionic/react";

export function planeTransition(_baseEl: HTMLElement, opts: any): Animation {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const entering: HTMLElement = opts.enteringEl;
  const leaving: HTMLElement | undefined = opts.leavingEl;
  const back = opts.direction === "back";
  const dur = reduced ? 1 : back ? 200 : 240;

  const root = createAnimation()
    .duration(dur)
    .easing("cubic-bezier(0.2, 0, 0, 1)");

  const enter = createAnimation().addElement(entering).beforeRemoveClass("ion-page-invisible");
  const leave = leaving ? createAnimation().addElement(leaving) : null;

  if (reduced) {
    enter.fromTo("opacity", "0", "1");
    if (leave) leave.fromTo("opacity", "1", "0");
  } else if (back) {
    /* pop: the covering plane slides out right; the one beneath holds still */
    if (leave) leave.fromTo("transform", "translateX(0)", "translateX(100%)");
    enter.fromTo("opacity", "1", "1");
  } else {
    /* push: the new plane slides in from the right over a still ground */
    enter
      .fromTo("transform", "translateX(100%)", "translateX(0)")
      .fromTo("boxShadow", "-10px 0 28px rgba(12,12,10,0)", "-10px 0 28px rgba(12,12,10,0.14)");
  }

  root.addAnimation(enter);
  if (leave) root.addAnimation(leave);
  return root;
}
