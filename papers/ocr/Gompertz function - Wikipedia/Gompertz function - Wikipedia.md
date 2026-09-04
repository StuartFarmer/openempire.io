# Gompertz function

The **Gompertz curve** or **Gompertz function** is a type of mathematical model for a time series, named after Benjamin Gompertz (1779–1865). It is a sigmoid function which describes growth as being slowest at the start and end of a given time period. The right-side or future value asymptote of the function is approached much more gradually by the curve than the left-side or lower valued asymptote. This is in contrast to the simple logistic function in which both asymptotes are approached by the curve symmetrically. It is a special case of the generalised logistic function. The function was originally designed to describe human mortality, but since has been modified to be applied in biology, with regard to detailing populations.

## History

Benjamin Gompertz (1779–1865) was an actuary in London who was privately educated.<sup>[1]</sup> He was elected a fellow of the Royal Society in 1819. The function was first presented in his June 16, 1825 paper at the bottom of page 518.<sup>[2]</sup> The Gompertz function reduced a significant collection of data in life tables into a single function. It is based on the assumption that the mortality rate increases exponentially as a person ages. The resulting Gompertz function is for the number of individuals living at a given age as a function of age.

Earlier work on the construction of functional models of mortality was done by the French mathematician Abraham de Moivre (1667–1754) in the 1750s.<sup>[3][4]</sup> However, de Moivre assumed that the mortality rate was constant. An extension to Gompertz's work was proposed by the English actuary and mathematician William Matthew Makeham (1826–1891) in 1860, who added a constant background mortality rate to Gompertz's exponentially increasing one.<sup>[5]</sup>

## Formula

$$f(t) = ae^{-be^{-ct}}$$

where

- $a$ is an asymptote, since $\lim_{t \rightarrow \infty} ae^{-be^{-ct}} = ae^0 = a$
- $b$ sets the displacement along the $x$ -axis (translates the graph to the left or right).
- $c$ sets the growth rate ( $y$ scaling)
- $e$ is Euler's Number ( $e = 2.71828\dots$ )

Graphs of Gompertz curves, showing the effect of varying one of $a, b, c$ while keeping the others constant

![Graph showing three Gompertz curves for different values of a: a = e/2 (blue), a = 1 (red), and a = 1/2 (green). The x-axis is t and the y-axis is a * e^{-e^{-t}}. The blue curve approaches a horizontal asymptote at y = e/2, the red curve at y = 1, and the green curve at y = 1/2. All curves pass through the point (0, 1/e).](dbac7ad25f8fe57949caae9b729a9eed_img.jpg)

Graph showing three Gompertz curves for different values of a: a = e/2 (blue), a = 1 (red), and a = 1/2 (green). The x-axis is t and the y-axis is a \* e^{-e^{-t}}. The blue curve approaches a horizontal asymptote at y = e/2, the red curve at y = 1, and the green curve at y = 1/2. All curves pass through the point (0, 1/e).

Varying $a$

## Properties

The curve $f(t) = ae^{-be^{-ct}} = ae^{-e^{-ct+\ln b}}$ has the same shape as $f(t) = e^{-e^{-t}}$ after an affine transformation.

The halfway point is found by solving $f(t) = a/2$ for $t$ .

$$t_{hwp} = \frac{\ln(b) - \ln(\ln(2))}{c}$$

The point of maximum rate of increase (**0.368a**) is found by solving $\frac{d^2}{dt^2} f(t) = 0$ for $t$ .

$$t_{max} = \ln(b)/c$$

The increase at $t_{max}$ is

$$\max\left(\frac{df}{dt}\right) = \frac{ac}{e}$$

![Graph of the Gompertz function f(t) = e^{b \cdot e^{-t}} for different values of b. The x-axis is t (ranging from -2 to 6) and the y-axis is e^{b \cdot e^{-t}} (ranging from -0.5 to 1.5). Three curves are shown: b = -1/4 (blue), b = -1 (red), and b = -4 (green). All curves start at (0, 1/e) and approach 1 as t increases. The blue curve is the steepest, followed by the red, then the green.](42350dead8413761d4223029b186e538_img.jpg)

Graph of the Gompertz function f(t) = e^{b \cdot e^{-t}} for different values of b. The x-axis is t (ranging from -2 to 6) and the y-axis is e^{b \cdot e^{-t}} (ranging from -0.5 to 1.5). Three curves are shown: b = -1/4 (blue), b = -1 (red), and b = -4 (green). All curves start at (0, 1/e) and approach 1 as t increases. The blue curve is the steepest, followed by the red, then the green.

Varying $b$

![Graph of the Gompertz function f(t) = e^{-e^{c \cdot t}} for different values of c. The x-axis is t (ranging from -2 to 6) and the y-axis is e^{-e^{c \cdot t}} (ranging from -0.5 to 1.5). Three curves are shown: c = -1/2 (green), c = -1 (red), and c = -2 (blue). All curves start at (0, 1/e) and approach 1 as t increases. The blue curve is the steepest, followed by the red, then the green.](3426682134add2661594007354827650_img.jpg)

Graph of the Gompertz function f(t) = e^{-e^{c \cdot t}} for different values of c. The x-axis is t (ranging from -2 to 6) and the y-axis is e^{-e^{c \cdot t}} (ranging from -0.5 to 1.5). Three curves are shown: c = -1/2 (green), c = -1 (red), and c = -2 (blue). All curves start at (0, 1/e) and approach 1 as t increases. The blue curve is the steepest, followed by the red, then the green.

Varying $c$

## Derivation

The function curve can be derived from a Gompertz–Makeham law of mortality, which states the rate of absolute mortality (decay) falls exponentially with current size. Mathematically,

$$k^r \propto \frac{1}{y(t)}$$

where

- $r = \frac{y'(t)}{y(t)}$ is the rate of growth
- $k$ is an arbitrary constant.

## Example uses

Examples of uses for Gompertz curves include:

- Mobile phone uptake, where costs were initially high (so uptake was slow), followed by a period of rapid growth, followed by a slowing of uptake as saturation was reached<sup>[6]</sup>
- Population in a confined space, as birth rates first increase and then slow as resource limits are reached<sup>[7]</sup>
- Modelling of growth of tumors<sup>[8]</sup>
- Modelling of cosmic reionization of hydrogen<sup>[9]</sup>
- Modelling market impact in finance<sup>[10]</sup> and aggregated subnational loans dynamic.<sup>[11]</sup>

- Detailing population growth in animals of prey, with regard to predator-prey relationships
- Modelling bacterial cells within a population
- Examining disease spread
- the size of the English Wikipedia can be modelled with Gompertz function and a modified function to some extent<sup>[12]</sup>

## Applications ---

## Gompertz curve

Population biology is especially concerned with the Gompertz function. This function is especially useful in describing the rapid growth of a certain population of organisms while also being able to account for the eventual horizontal asymptote, once the carrying capacity is determined (plateau cell/population number).

It is modeled as follows:

$$N(t) = N_0 \exp(\ln(N_I/N_0)(1 - \exp(-bt)))$$

where:

- $t$ is time
- $N_0$ is the initial density of cells
- $N_I$ is the plateau cell/population density
- $b$ is the initial rate of tumor growth

This function consideration of the plateau cell number makes it useful in accurately mimicking real-life population dynamics. The function also adheres to the sigmoid function, which is the most widely accepted convention of generally detailing a population's growth. Moreover, the function makes use of initial growth rate, which is commonly seen in populations of bacterial and cancer cells, which undergo the log phase and grow rapidly in numbers. Despite its popularity, the function initial rate of tumor growth is difficult to predetermine given the varying microcosms present with a patient, or varying environmental factors in the case of population biology. In cancer patients, factors such as age, diet, ethnicity, genetic pre-dispositions, metabolism, lifestyle and origin of metastasis play a role in determining the tumor growth rate. The carrying capacity is also expected to change based on these factors, and so describing such phenomena is difficult.

## Metabolic curve

The metabolic function is particularly concerned with accounting for the rate of metabolism within an organism. This function can be applied to monitor tumor cells; metabolic rate is dynamic and is greatly flexible, making it more precise in detailing cancer growth. The metabolic curve takes in to consideration the energy the body provides in maintaining and creating tissue. This energy can be considered as metabolism and follows a specific pattern in cellular division. Energy conservation can

be used to model such growth, irrespective of differing masses and development times. All taxa share a similar growth pattern and this model, as a result, considers cellular division, the foundation of the development of a tumor.

$$B = \sum_C (N_C B_C) + \left( E_C \frac{dN_C}{dt} \right)$$

- $B$ = energy organism uses at rest
- $N_C$ = number of cells in the given organism
- $B_C$ = metabolic rate of an individual cell
- $N_C B_C$ = energy required to maintain the existing tissue
- $E_C$ = energy required to create new tissue from an individual cell

The differentiation between energy used at rest and metabolic rate work allows for the model to more precisely determine the rate of growth. The energy at rest is lower than the energy used to maintain a tissue, and together represent the energy required to maintain the existing tissue. The use of these two factors, alongside the energy required to create new tissue, comprehensively map the rate of growth, and moreover, lead in to an accurate representation of the lag phase.

## Growth of tumors

In the 1960s A.K. Laird<sup>[13]</sup> for the first time successfully used the Gompertz curve to fit data of growth of tumors. In fact, tumors are cellular populations growing in a confined space where the availability of nutrients is limited. Denoting the tumor size as $X(t)$ it is useful to write the Gompertz Curve as follows:

$$X(t) = K \exp \left( \log \left( \frac{X(0)}{K} \right) \exp(-\alpha t) \right)$$

where:

- $X(0)$ is the tumor size at the starting observation time;
- $K$ is the carrying capacity, i.e. the maximum size that can be reached with the available nutrients. In fact it is:

$$\lim_{t \rightarrow +\infty} X(t) = K$$

independently on $X(0) > 0$ . Note that, in absence of therapies etc.. usually it is $X(0) < K$ , whereas, in presence of therapies, it may be $X(0) > K$ ;

- $\alpha$ is a constant related to the proliferative ability of the cells.
- $\log()$ refers to the natural log.

It can be shown that the dynamics of $X(t)$ are governed by the Gompertz differential equation:

$$X'(t) = \alpha \log\left(\frac{K}{X(t)}\right) X(t)$$

i.e. is of the form when broken down:

$$X'(t) = F(X(t)) X(t), \quad \text{with} \quad F'(X) \leq 0,$$

$F(X)$ is the instantaneous proliferation rate of the cellular population, whose decreasing nature is due to the competition for the nutrients due to the increase of the cellular population, similarly to the logistic growth rate. However, there is a fundamental difference: in the logistic case the proliferation rate for small cellular population is finite:

$$F(X) = \alpha \left(1 - \left(\frac{X}{K}\right)^\nu\right) \Rightarrow F(0) = \alpha < +\infty$$

whereas in the Gompertz case the proliferation rate is unbounded:

$$\lim_{X \rightarrow 0^+} F(X) = \lim_{X \rightarrow 0^+} \alpha \log\left(\frac{K}{X}\right) = +\infty$$

As noticed by Steel<sup>[14]</sup> and by Wheldon,<sup>[15]</sup> the proliferation rate of the cellular population is ultimately bounded by the cell division time. Thus, this might be an evidence that the Gompertz equation is not good to model the growth of small tumors. Moreover, more recently it has been noticed<sup>[16]</sup> that, including the interaction with immune system, Gompertz and other laws characterized by unbounded $F(0)$ would preclude the possibility of immune surveillance.

The theoretical study by Fornalski et al.<sup>[17]</sup> showed the biophysical basis of the Gompertz curve for cancer growth except very early phase where parabolic function is more appropriate. They found also that the Gompertz curve describes the most typical case among the broad family of the cancer dynamics' functions.

### Gompertz growth and logistic growth

The Gompertz differential equation

$$X'(t) = \alpha \log\left(\frac{K}{X(t)}\right) X(t)$$

is the limiting case of the generalized logistic differential equation

$$X'(t) = \alpha \nu \left( 1 - \left( \frac{X(t)}{K} \right)^{\frac{1}{\nu}} \right) X(t)$$

(where $\nu > 0$ is a positive real number) since

$$\lim_{\nu \rightarrow +\infty} \nu \left( 1 - x^{1/\nu} \right) = -\log(x)$$

In addition, there is an inflection point in the graph of the generalized logistic function when

$$X(t) = \left( \frac{\nu}{\nu + 1} \right)^{\nu} K$$

and one in the graph of the Gompertz function when

$$X(t) = \frac{K}{e} = K \cdot \lim_{\nu \rightarrow +\infty} \left( \frac{\nu}{\nu + 1} \right)^{\nu}$$

### **Gomp-ex law of growth**

Based on the above considerations, Wheldon<sup>[15]</sup> proposed a mathematical model of tumor growth, called the Gomp-Ex model, that slightly modifies the Gompertz law. In the Gomp-Ex model it is assumed that initially there is no competition for resources, so that the cellular population expands following the exponential law. However, there is a critical size threshold $X_G$ such that for $X > X_G$ . The assumption that there is no competition for resources holds true in most scenarios. It can however be affected by limiting factors, that requires the creation of sub-factors variables.

the growth follows the Gompertz Law:

$$F(X) = \max \left( a, \alpha \log \left( \frac{K}{X} \right) \right)$$

so that:

$$X_G = K \exp \left( -\frac{a}{\alpha} \right).$$

Here there are some numerical estimates<sup>[15]</sup> for $X_G$ :

- $X_G \approx 10^9$ for human tumors

- $X_C \approx 10^6$ for murine (mouse) tumors

## Inverse Gompertz function ---

The Gompertz function is a one-to-one correspondence (also known as an Bijjective function) and so its inverse function can be explicitly expressed in traditional functional notation as a single continuous function. Given a Gompertz function of the form:

$$f(t) = ae^{-e^{b-a}} + d$$

where

- $d$ is the base horizontal asymptote, since $\lim_{t \rightarrow -\infty} ae^{-e^{b-a}} + d = ae^{-\infty} + d = d$
- $a$ is the distance from the base to the second asymptote, since $\lim_{t \rightarrow \infty} ae^{-e^{b-a}} + d = ae^0 + d = a + d$
- $b$ sets the displacement along the $x$ -axis (translates the graph to the left or right).
- $c$ sets the growth rate ( $\gamma$ scaling)
- $e$ is Euler's Number ( $e = 2.71828\dots$ )

the corresponding inverse function can be expressed as:

$$f^{-1}(t) = \frac{1}{c} \left[ b - \ln \left( \ln \left( \frac{a}{t-d} \right) \right) \right]$$

The inverse function only produces numerical values in the set of real numbers between its two asymptotes, which are now vertical instead of horizontal like in the forward Gompertz function. Outside of the range defined by the vertical asymptotes, the inverse function requires computing the logarithm of negative numbers. For this and other reasons it is often impractical to try to fit an inverse Gompertz function to data directly, especially if one only has relatively few data points available from which to calculate the fit. Instead one can fit the transposed relationship of the data to a forward Gompertz function, and then convert it to the equivalent inverse function using the relationship between the two given above.

In this way the inverse function has many uses. For instance, certain ELISA assays have a standard curve whose concentrations can be fit extremely well to their optical density by a Gompertz function. Once the standards are thus fit to a Gompertz function, calculating the unknown concentration of samples in the assay from their measured optical density is achieved using the inverse of the Gompertz function that was produced when fitting the standard curve.

## See also ---

- Gompertz distribution
- Growth curve
- Von Bertalanffy function

- [Sigmoid function](#)

## References

- Kirkwood, TBL (2015). "Deciphering death: a commentary of Gompertz (1825)'On the nature of the function expressive of the law of human mortality, and on a new mode of determining the value of life contingencies'" (<https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4360127>). _Philosophical Transactions of the Royal Society of London B_. **370** (1666). doi:10.1098/rstb.2014.0379 (<https://doi.org/10.1098%2Frstb.2014.0379>). PMC 4360127 (<https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4360127>). PMID 25750242 (<https://pubmed.ncbi.nlm.nih.gov/25750242>).
- Gompertz, Benjamin (1825). "On the nature of the function expressive of the law of human mortality, and on a new mode of determining the value of life contingencies" (<https://zenodo.org/record/1432356>). _Philosophical Transactions of the Royal Society of London_. **115**: 513–585. doi:10.1098/rstl.1825.0026 (<https://doi.org/10.1098%2Frstl.1825.0026>). S2CID 145157003 (<https://api.semanticscholar.org/CorpusID:145157003>). Archived (<https://web.archive.org/web/20210120013225https://zenodo.org/record/1432356>) from the original on 2021-01-20. Retrieved 2020-09-04.
- de Moivre, Abraham (1725). _Annuities upon Lives ..._ (<https://books.google.com/books?id=T7JgAAAcAAJ&pg=PP7>). London, England: Francis Fayram, Benj. Motte, and W. Pearson. A second edition was issued in 1743; a third edition was issued in 1750; a fourth edition was issued in 1752.
- Greenwood, M. (1928). "Laws of Mortality from the Biological Point of View" (<https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2167778>). _Journal of Hygiene_. **28** (3): 267–294. doi:10.1017/S002217240000961X (<https://doi.org/10.1017%2FS002217240000961X>). PMC 2167778 (<https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2167778>). PMID 20475000 (<https://pubmed.ncbi.nlm.nih.gov/20475000>).
- Makeham, William Matthew (1860). "On the law of mortality and the construction of annuity tables" (<https://archive.org/details/jstor-41134925/page/n1/mode/2up>). _The Assurance Magazine, and Journal of the Institute of Actuaries_. **8** (6): 301–310. doi:10.1017/S204616580000126X (<https://doi.org/10.1017%2FS204616580000126X>).
- Islam T, Fiebig DG, Meade N (2002). "Modelling multinational telecommunications demand with limited data". _International Journal of Forecasting_. **18** (4): 605–624. doi:10.1016/S0169-2070(02)00073-0 (<https://doi.org/10.1016%2FS0169-2070%2802%2900073-0>).
- Zwietering MH, Jongenburger I, Rombouts FM, van 't Riet K (June 1990). "Modeling of the bacterial growth curve" (<https://www.ncbi.nlm.nih.gov/pmc/articles/PMC184525>). _Applied and Environmental Microbiology_. **56** (6): 1875–81. Bibcode:1990ApEnM..56.1875Z (<https://ui.adsabs.harvard.edu/abs/1990ApEnM..56.1875Z>). doi:10.1128/AEM.56.6.1875-1881.1990 (<https://doi.org/10.1128%2FAEM.56.6.1875-1881.1990>). PMC 184525 (<https://www.ncbi.nlm.nih.gov/pmc/articles/PMC184525>). PMID 16348228 (<https://pubmed.ncbi.nlm.nih.gov/16348228>)..
- Sottoriva A, Verhoeff JJ, Borovski T, McWeeney SK, Naumov L, Medema JP, et al. (January 2010). "Cancer stem cell tumor model reveals invasive morphology and increased phenotypical heterogeneity" (<https://doi.org/10.1158%2F0008-5472.CAN-09-3663>). _Cancer Research_. **70** (1): 46–56. doi:10.1158/0008-5472.CAN-09-3663 (<https://doi.org/10.1158%2F0008-5472.CAN-09-3663>). PMID 20048071 (<https://pubmed.ncbi.nlm.nih.gov/20048071>).
- Montero-Camacho, Paulo; Li, Yin; Cranmer, Miles (2024). "Five parameters are all you need (in $\Lambda$ CDM)". arXiv:2405.13680 (<https://arxiv.org/abs/2405.13680>) [astro-ph.CO (<https://arxiv.org/archive/astro-ph.CO>)].

10. Caravelli F, Sindoni L, Caccioli F, Ududec C (August 2016). "Optimal growth trajectories with finite carrying capacity". _Physical Review E_. **94** (2–1) 022315. arXiv:1510.05123 (<https://arxiv.org/abs/1510.05123>). Bibcode:2016PhRvE..94b2315C (<https://ui.adsabs.harvard.edu/abs/2016PhRvE..94b2315C>). doi:10.1103/PhysRevE.94.022315 (<https://doi.org/10.1103%2FPhysRevE.94.022315>). PMID 27627325 (<https://pubmed.ncbi.nlm.nih.gov/27627325/>). S2CID 35578084 (<https://api.semanticscholar.org/CorpusID:35578084>).
11. Rocha LS, Rocha FS, Souza TT (2017-10-05). "Is the public sector of your country a diffusion borrower? Empirical evidence from Brazil" (<https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5628819>). _PLOS ONE_. **12** (10) e0185257. arXiv:1604.07782 (<https://arxiv.org/abs/1604.07782>). Bibcode:2017PLoSO..1285257R (<https://ui.adsabs.harvard.edu/abs/2017PLoSO..1285257R>). doi:10.1371/journal.pone.0185257 (<https://doi.org/10.1371%2Fjournal.pone.0185257>). PMC 5628819 (<https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5628819>). PMID 28981532 (<https://pubmed.ncbi.nlm.nih.gov/28981532/>).
12. "Wikipedia:Modelling Wikipedia's growth" ([https://en.wikipedia.org/w/index.php?title=Wikipedia:Modelling\\\_Wikipedia%27s\\\_growth&oldid=1145298796](https://en.wikipedia.org/w/index.php?title=Wikipedia:Modelling_Wikipedia%27s_growth&oldid=1145298796)), _Wikipedia_, 2023-03-18, archived ([https://web.archive.org/web/20250306125722/https://en.wikipedia.org/w/index.php?title=Wikipedia%3AModelling\\\_Wikipedia%27s\\\_growth&oldid=1145298796](https://web.archive.org/web/20250306125722/https://en.wikipedia.org/w/index.php?title=Wikipedia%3AModelling_Wikipedia%27s_growth&oldid=1145298796)) from the original on 2025-03-06, retrieved 2023-03-23
13. Laird AK (September 1964). "Dynamics of Tumor Growth" (<https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2071101>). _British Journal of Cancer_. **13** (3): 490–502. doi:10.1038/bjc.1964.55 (<https://doi.org/10.1038%2Fbjc.1964.55>). PMC 2071101 (<https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2071101>). PMID 14219541 (<https://pubmed.ncbi.nlm.nih.gov/14219541/>).
14. Steel GG (1977). _Growth Kinetics of Tumors_. Oxford: Clarendon Press. ISBN 0-19-857388-X.
15. Wheldon TE (1988). _Mathematical Models in Cancer Research_. Bristol: Adam Hilger. ISBN 0-85274-291-6.
16. d'Onofrio A (2005). "A general framework for modeling tumor-immune system competition and immunotherapy: Mathematical analysis and biomedical inferences". _Physica D_. **208** (3–4): 220–235. arXiv:1309.3337 (<https://arxiv.org/abs/1309.3337>). Bibcode:2005PhyD..208..220D (<https://ui.adsabs.harvard.edu/abs/2005PhyD..208..220D>). doi:10.1016/j.physd.2005.06.032 (<https://doi.org/10.1016%2Fj.physd.2005.06.032>). S2CID 15031322 (<https://api.semanticscholar.org/CorpusID:15031322>).
17. Fornalski KW, Reszczyńska J, Dobrzyński L, Wysocki P, Janiak MK (2020). "Possible Source of the Gompertz Law of Proliferating Cancer Cells: Mechanistic Modeling of Tumor Growth" (<https://doi.org/10.12693%2FAPhysPolA.138.854>). _Acta Physica Polonica A_. **138** (6): 854–862. Bibcode:2020AcPPA.138..854F (<https://ui.adsabs.harvard.edu/abs/2020AcPPA.138..854F>). doi:10.12693/APhysPolA.138.854 (<https://doi.org/10.12693%2FAPhysPolA.138.854>).

## External links

- Weisstein, Eric W. "Gompertz Curve" (<https://mathworld.wolfram.com/GompertzCurve.html>). _MathWorld_.
- <https://archive.org/details/philtrans04942340>
- <http://chemoth.com/tumorgrowth> Archived (<https://web.archive.org/web/20180624010608/http://chemoth.com/tumorgrowth>) 2018-06-24 at the Wayback Machine

Retrieved from "[https://en.wikipedia.org/w/index.php?title=Gompertz\\\_function&oldid=1363340603](https://en.wikipedia.org/w/index.php?title=Gompertz_function&oldid=1363340603)"
