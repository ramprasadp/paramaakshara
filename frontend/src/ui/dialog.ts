// SPDX-License-Identifier: GPL-3.0-or-later

// Modal dialogs on one <dialog> element. Content is built with DOM text
// nodes only, so file names and messages can never inject markup.

export interface Button<T> {
  label: string;
  value: T;
  primary?: boolean;
}

function dialogElement(): HTMLDialogElement {
  return document.getElementById("dialog") as HTMLDialogElement;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

/**
 * Shows a dialog with a title, body and buttons. Resolves with the value
 * of the button pressed, or null when dismissed with Escape.
 */
export function show<T>(
  title: string,
  body: (Node | string)[],
  buttons: Button<T>[],
): Promise<T | null> {
  const d = dialogElement();
  d.replaceChildren();
  const form = el("form", { method: "dialog" });
  form.append(el("h2", {}, title));
  for (const part of body)
    form.append(typeof part === "string" ? el("p", {}, part) : part);
  const row = el("div", { className: "dialog-buttons" });
  let result: T | null = null;
  buttons.forEach((b) => {
    const button = el(
      "button",
      { type: "submit", className: b.primary ? "primary" : "" },
      b.label,
    );
    button.addEventListener("click", () => {
      result = b.value;
    });
    row.append(button);
  });
  form.append(row);
  d.append(form);
  return new Promise((resolve) => {
    d.addEventListener("close", () => resolve(result), { once: true });
    d.showModal();
    (
      d.querySelector("input, select, button.primary") as HTMLElement | null
    )?.focus();
  });
}

/** Closes the open dialog with a given result (for list-style dialogs). */
export function closeDialog(): void {
  dialogElement().close();
}

export function alertBox(title: string, message: string): Promise<unknown> {
  return show(title, [message], [{ label: "OK", value: true, primary: true }]);
}

export async function confirmBox(
  title: string,
  message: string,
  ok = "Continue",
): Promise<boolean> {
  return (
    (await show(
      title,
      [message],
      [
        { label: "Cancel", value: false },
        { label: ok, value: true, primary: true },
      ],
    )) === true
  );
}
