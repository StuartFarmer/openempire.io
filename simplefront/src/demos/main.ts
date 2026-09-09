import "./city-demand/CityDemandDemo";
import "./city-local/CityLocalDemo";
import "./city-population/CityPopulationDemo";
import "./DemoGallery";
import "./demos.css";
import "./urban-growth/UrbanGrowthDemo";

const root = document.querySelector("#demos-root")!;
function showDemo() {
  const tag =
    window.location.hash === "#urban-growth"
      ? "urban-growth-demo"
      : window.location.hash === "#city-demand"
        ? "city-demand-demo"
        : window.location.hash === "#city-population"
          ? "city-population-demo"
          : window.location.hash === "#city-local"
            ? "city-local-demo"
            : "demo-gallery";
  if (root.firstElementChild?.tagName.toLowerCase() === tag) return;
  root.replaceChildren(document.createElement(tag));
  document.title =
    tag === "urban-growth-demo"
      ? "Urban Growth · SimpleFront Demos"
      : tag === "city-demand-demo"
        ? "Demand-led City · SimpleFront Demos"
        : tag === "city-population-demo"
          ? "Population-led City · SimpleFront Demos"
          : tag === "city-local-demo"
            ? "Local Development · SimpleFront Demos"
            : "SimpleFront · Demos";
}
window.addEventListener("hashchange", showDemo);
showDemo();
