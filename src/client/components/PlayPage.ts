import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { translateText } from "../Utils";
import type { SinglePlayerModal } from "../SinglePlayerModal";
import type { UsernameInput } from "../UsernameInput";

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

  private openSinglePlayerModal = () => {
    if (!this.validateUsername()) return;
    (
      document.querySelector("single-player-modal") as SinglePlayerModal
    )?.open();
  };

  render() {
    return html`
      <div
        id="page-play"
        class="flex flex-col gap-2 w-full px-0 lg:px-4 min-h-0"
      >
        <!-- Mobile: Fixed top bar -->
        <div
          class="lg:hidden fixed left-0 right-0 top-0 z-40 pt-[env(safe-area-inset-top)] bg-surface border-b border-white/10"
        >
          <div
            class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center h-14 px-2 gap-2"
          >
            <button
              id="hamburger-btn"
              class="col-start-1 justify-self-start h-10 shrink-0 aspect-[4/3] flex text-white/90 rounded-md items-center justify-center transition-colors"
              data-i18n-aria-label="main.menu"
              aria-expanded="false"
              aria-controls="sidebar-menu"
              aria-haspopup="dialog"
              data-i18n-title="main.menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-8"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>

            <div
              class="col-start-2 flex items-center justify-center text-malibu-blue min-w-0"
            >
              <img
                src=${assetUrl("images/OpenFrontLogo.svg")}
                alt="OpenFront"
                class="h-full w-auto"
              />
            </div>

            <div
              aria-hidden="true"
              class="col-start-3 justify-self-end h-10 shrink-0 aspect-[4/3]"
            ></div>
          </div>
        </div>

        <div class="w-full pb-4 lg:pb-0 flex flex-col gap-4">
          <!-- Mobile: spacer for fixed top bar -->
          <div class="lg:hidden h-[calc(env(safe-area-inset-top)+56px)]"></div>

          <!-- Username -->
          <div
            class="px-2 py-2 bg-surface border-y border-white/10 overflow-visible lg:flex lg:items-center lg:gap-x-2 lg:h-[60px] lg:p-3 lg:relative lg:z-20 lg:border-y-0 lg:rounded-xl"
          >
            <div class="flex items-center gap-2 min-w-0 w-full">
              <username-input
                class="flex-1 min-w-0 h-10 lg:h-[50px]"
              ></username-input>
            </div>
          </div>

          <!-- Game entry points -->
          <div class="flex flex-col gap-3 px-2 lg:px-0">
            <button
              class="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-lg font-bold uppercase tracking-wider transition-colors cursor-pointer"
              @click=${this.openSinglePlayerModal}
            >
              ${translateText("play_page.singleplayer")}
            </button>
            <div class="flex gap-3">
              <a
                href="#generator"
                class="flex-1 py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-center font-medium uppercase tracking-wider transition-colors"
              >
                ${translateText("play_page.map_generator")}
              </a>
              <a
                href="#alternative"
                class="flex-1 py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-center font-medium uppercase tracking-wider transition-colors"
              >
                ${translateText("play_page.sandbox")}
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
