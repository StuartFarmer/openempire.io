import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import type { UsernameInput } from "../UsernameInput";
import { translateText } from "../Utils";
import "./FlagPicker";

/**
 * The front page. Deliberately spare and dark, matching the #shell viewer
 * rather than the old marketing splash: a title, who you are, and the ways
 * in. No nav bar — settings and help were chrome around a game that now starts
 * in one click.
 */
@customElement("play-page")
export class PlayPage extends LitElement {
  createRenderRoot() {
    return this;
  }

  private validateUsername(): boolean {
    const usernameInput = document.querySelector(
      "username-input",
    ) as UsernameInput | null;
    return usernameInput?.canPlay() ?? true;
  }

  /** Straight into the shell — the game runs there now, not through a lobby. */
  private startGame = () => {
    if (!this.validateUsername()) return;
    window.location.hash = "#shell";
  };

  render() {
    return html`
      <div
        id="page-play"
        class="flex flex-col items-center justify-center w-full flex-1 min-h-0 px-6 py-10 text-white"
      >
        <!-- The menu carries its own scrim so it stays readable whatever the
             live backdrop is doing behind it. -->
        <div
          class="flex flex-col items-center gap-8 w-full max-w-sm rounded-2xl bg-black/75 backdrop-blur-sm border border-white/10 px-8 py-10"
        >
          <h1
            class="text-4xl sm:text-5xl font-semibold tracking-tight text-center"
          >
            OpenEmpire<span class="text-white/40">.io</span>
          </h1>

          <!-- Flag + clan tag + name. Sized to the buttons so the column reads as
               one object rather than a form sitting above some links. -->
          <div class="flex items-center gap-2 w-full h-12">
            <flag-picker></flag-picker>
            <username-input class="flex-1 min-w-0 h-full"></username-input>
          </div>

          <div class="flex flex-col gap-3 w-full">
            <button
              class="w-full py-3 rounded border border-white/20 bg-white/10 hover:bg-white/20 text-white text-base font-semibold tracking-wide transition-colors cursor-pointer"
              @click=${this.startGame}
            >
              ${translateText("play_page.start_game")}
            </button>
            <a
              data-demos
              href="/simplefront/demos/"
              class="w-full py-3 rounded border border-white/20 bg-white/10 hover:bg-white/20 text-white text-center text-base font-semibold tracking-wide transition-colors"
            >
              ${translateText("play_page.demos")}
            </a>
            <a
              href="#generator"
              class="w-full py-2.5 rounded border border-white/10 hover:bg-white/10 text-white/60 hover:text-white/90 text-center text-sm tracking-wide transition-colors"
            >
              ${translateText("play_page.map_generator")}
            </a>
          </div>
        </div>
      </div>
    `;
  }
}
