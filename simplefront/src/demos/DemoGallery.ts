import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("demo-gallery")
export class DemoGallery extends LitElement {
  createRenderRoot() {
    return this;
  }
  render() {
    return html` <div class="demo-shell gallery">
      <header class="demo-header">
        <a class="wordmark" href="#">SIMPLEFRONT <span>/ DEMOS</span></a
        ><a class="back-link" href="/" aria-label="Back to homepage">← Home</a>
      </header>
      <section class="gallery-intro">
        <p class="eyebrow">SMALL SYSTEMS. VISIBLE CONSEQUENCES.</p>
        <h1>A place to<br /><em>play with the rules.</em></h1>
        <p>
          Isolated experiments, complete presets and a clear view of what
          changes. Nothing here changes the playable game.
        </p>
      </section>
      <a class="demo-card" href="#urban-growth">
        <div class="card-art" aria-hidden="true">
          <div class="art-river"></div>
          <div class="art-town"></div>
          <span>01 / DEVELOPMENT</span>
        </div>
        <div class="card-copy">
          <p class="eyebrow">URBAN GROWTH LAB</p>
          <h2>Grow outward.<br />Build upward.</h2>
          <p>
            Place a city. Watch terrain guide its shape and neighbourhoods
            become denser. Six ready-to-run landscapes.
          </p>
          <span class="open-demo">Open experiment <span>↗</span></span>
        </div>
      </a>
      <a class="demo-card demand-card" href="#city-demand">
        <div class="card-art" aria-hidden="true">
          <div class="art-river"></div>
          <div class="art-town"></div>
          <span>02 / PEOPLE & PLACES</span>
        </div>
        <div class="card-copy">
          <p class="eyebrow">DEMAND-LED CITY LAB</p>
          <h2>People come and go.<br />The city stays.</h2>
          <p>
            The original Urban Growth Lab with integer levels, population and
            vacancies, and no city ceiling. Same six landscapes, terrain editor
            and neighbourhood growth rules.
          </p>
          <span class="open-demo">Open experiment <span>↗</span></span>
        </div>
      </a>
      <footer class="gallery-footer">
        Isolated city experiments · no gameplay changes
        <a href="../#shell">Go to SimpleFront gameplay ↗</a>
      </footer>
    </div>`;
  }
}
