See discussions, stats, and author profiles for this publication at: <https://www.researchgate.net/publication/43290602>

# FAO-56 Dual Crop Coefficient Method for Estimating Evaporation from Soil and Application Extensions

**Article** in _Journal of Irrigation and Drainage Engineering_ · February 2005

DOI: 10.1061/(ASCE)0733-9437(2005)131:1(2) · Source: OAI

CITATIONS

191

READS

633

5 authors, including:

![Profile picture of Richard G Allen](1d7527f4316cfe2d342b08d1653d1592_img.jpg)

Profile picture of Richard G Allen

**Richard G Allen**

University of Idaho

194 PUBLICATIONS 12,953 CITATIONS

SEE PROFILE

![Profile picture of L. S. Pereira](5a36d88d3904f3f2d386c7cf63fa5053_img.jpg)

Profile picture of L. S. Pereira

**L. S. Pereira**

University of Lisbon

380 PUBLICATIONS 17,116 CITATIONS

SEE PROFILE

![Profile picture of Dirk Raes](31cdb383e9cc2643a547f2500ed3cd08_img.jpg)

Profile picture of Dirk Raes

**Dirk Raes**

University of Leuven

77 PUBLICATIONS 1,745 CITATIONS

SEE PROFILE

Some of the authors of this publication are also working on these related projects:

![Project icon](cb5eaf8e70e3c5f8770cd7649d1ec5dd_img.jpg)

Project icon

no title [View project](#)

All content following this page was uploaded by [Dirk Raes](#) on 31 March 2014.

The user has requested enhancement of the downloaded file. All in-text references [underlined in blue](#) are added to the original document and are linked to publications on ResearchGate, letting you access and read them immediately.

# FAO-56 Dual Crop Coefficient Method for Estimating Evaporation from Soil and Application Extensions

Richard G. Allen, M.ASCE<sup>1</sup>; Luis S. Pereira, M.ASCE<sup>2</sup>; Martin Smith<sup>3</sup>; Dirk Raes<sup>4</sup>; and James L. Wright, M.ASCE<sup>5</sup>

**Abstract:** Crop coefficient curves provide simple, reproducible means to estimate crop evapotranspiration (ET) from weather-based reference ET values. The dual crop coefficient ( $K_c$ ) method of the Food and Agricultural Organization of the United States (FAO) Irrigation and Drainage Paper No. 56 (FAO-56) is intended to improve daily simulation of crop ET by considering separately the contribution of evaporation from soil. The dual method utilizes “basal” crop coefficients representing ET from crops having a dry soil surface and separately predicts evaporation from bare soil based on a water balance of the soil surface layer. Three extensions to the evaporation calculation procedure are described here that are intended to improve accuracy when applications warrant the extra complexity. The first extension uses parallel water balances representing the portion of the soil surface wetted by irrigation and precipitation together and the portion wetted by precipitation alone. The second extension uses three “stages” for surface drying and provides for application to deep cracking soils. The third extension predicts the extraction of the transpiration component from the soil surface layer. Sensitivity and analyses and illustrations indicate moderate sensitivity of daily calculated ET to application of the extensions. The dual $K_c$ procedure, although relatively simple computationally and structurally, estimates daily ET as measured by lysimeter relatively well for periods of bare soil and partial and full vegetation cover.

**DOI:** 10.1061/(ASCE)0733-9437(2005)131:1(2)

**CE Database subject headings:** Evapotranspiration; Evaporation; Crops; Crop moisture index; Soil water.

## Introduction

A commonly used approach for estimating consumptive use of water by irrigated crops is the crop coefficient—reference evapotranspiration ( $K_c ET_0$ ) procedure. Reference evapotranspiration ( $ET_0$ ) is computed for a grass or alfalfa reference crop and is then multiplied by an empirical crop coefficient ( $K_c$ ) to estimate crop evapotranspiration ( $ET_c$ ) (Jensen et al. 1971; Doorenbos and Pruitt 1977; Wright 1981, 1982). In general, three primary characteristics distinguish ET from a crop from ET from the reference surface: aerodynamic roughness of the crop; general resistance within the crop canopy and soil to the flow of heat and water vapor; and reflectance of the crop and soil surface to short wave radiation. Because $ET_0$ represents nearly all effects of weather, $K_c$ varies predominately with specific crop characteristics and only a

small amount with climate. This enables the transfer of standard values and curves for $K_c$ between locations and climates. This transfer has led to the widespread acceptance and usefulness of the $K_c$ approach.

In situations where $K_c$ has not been derived by ET measurement, it can be estimated from fraction of ground cover or leaf area index (Allen et al. 1998). $K_c$ varies during the growing season as plants develop, as the fraction of ground covered by vegetation changes, and as plants age and mature (Fig. 1). $K_c$ varies according to the wetness of the soil surface, especially when there is little vegetation cover. Under bare soil conditions, $K_c$ has a high value when soil is wet and its value steadily decreases as the soil dries.

This paper describes the dual $K_c$ procedure of FAO published as _FAO Irrigation and Drainage Paper No. 56_ (Allen et al. 1998) and provides a brief rationale for various components of the procedure along with selected sensitivity analyses. Extensions to the original procedure are introduced that may improve accuracy of applications for special situations.

## FAO-56 $K_c$ Procedure

The FAO-56 crop coefficients are intended for use with grass reference $ET_0$ similar to that predicted by the FAO-56 Penman-Monteith method (Allen et al. 1998). The FAO-56 Penman-Monteith equation predicts $ET_0$ from a hypothetical grass reference surface that is 0.12 m in height having a surface resistance of $70 \text{ s m}^{-1}$ for 24 h time steps and albedo of 0.23. Standardized equations for computing parameters in the FAO-56 Penman-Monteith equation are given in Allen et al. (1998, 1994) as well

<sup>1</sup>Professor, Univ. of Idaho, 3793 N. 3600 E., Kimberly, ID 83341 (corresponding author). E-mail: rallen@uidaho.edu

<sup>2</sup>Professor, Institute of Agronomy, Technical Univ. of Lisbon, Lisbon, Portugal. E-mail: lspereira@isa.utl.pt

<sup>3</sup>Country Representative, Madagascar, Africa FAO; formerly, Chief Officer, Rome, Italy. E-mail: martin.smith@fao.org

<sup>4</sup>Professor, Catholic Univ., Leuven, Belgium. E-mail: dirk.raes@agr.kuleuven.ac.be

<sup>5</sup>Research Soil Scientist, USDA-ARS, Kimberly, ID 83341. E-mail: wright@nwisrl.ars.usda.gov

Note. Discussion open until July 1, 2005. Separate discussions must be submitted for individual papers. To extend the closing date by one month, a written request must be filed with the ASCE Managing Editor. The manuscript for this paper was submitted for review and possible publication on February 27, 2003; approved on June 27, 2003. This paper is part of the _Journal of Irrigation and Drainage Engineering_, Vol. 131, No. 1, February 1, 2005. ©ASCE, ISSN 0733-9437/2005/1-2-13/\$25.00.

![Figure 1: Schematic showing generalized shape of Food and Agricultural Organization (FAO) Kc curve with four crop stages and three Kc values. The graph plots Kc (y-axis, 0.0 to 1.2) against Time of Season, days (x-axis). The curve is divided into four stages: Initial Period (Kc ini), Crop Dev. Period (Kc mid), Mid Season Period (Kc mid), and Late Season Period (Kc end). The Kc curve starts at Kc ini, rises linearly to Kc mid, remains constant at Kc mid through the Mid Season Period, and then falls linearly to Kc end. Above the curve, illustrations show the relative development of vegetation: sparse seedlings in the initial period, growing plants in the development period, full canopy in the mid-season period, and senescing plants in the late season period.](ad04aa6cb9e7fb36bb7a91e817e2d314_img.jpg)

Figure 1: Schematic showing generalized shape of Food and Agricultural Organization (FAO) Kc curve with four crop stages and three Kc values. The graph plots Kc (y-axis, 0.0 to 1.2) against Time of Season, days (x-axis). The curve is divided into four stages: Initial Period (Kc ini), Crop Dev. Period (Kc mid), Mid Season Period (Kc mid), and Late Season Period (Kc end). The Kc curve starts at Kc ini, rises linearly to Kc mid, remains constant at Kc mid through the Mid Season Period, and then falls linearly to Kc end. Above the curve, illustrations show the relative development of vegetation: sparse seedlings in the initial period, growing plants in the development period, full canopy in the mid-season period, and senescing plants in the late season period.

**Fig. 1.** Schematic showing generalized shape of Food and Agricultural Organization (FAO) $K_c$ curve with four crop stages and three $K_c$ ( $K_{cb}$ ) values and relative development of vegetation

as in Smith et al. (1991), Pereira et al. (1998), Pereira and Allen (1999), and ASCE (2002).

### Crop Coefficient

Fundamentally, the crop coefficient is defined as the ratio of ET from any specific crop or soil surface to some reference ET as defined by weather data. In _FAO-56_ nomenclature

$$K_c = \frac{ET_c}{ET_0} \quad (1)$$

In _FAO-56_, values listed for $K_c$ represent ET under growing conditions having a high level of management and with little or no water or other ET reducing stresses and thus represent what are referred to as potential levels for crop ET

$$ET_c = K_c ET_0 \quad (2)$$

Actual $ET_c$ can be less than the potential $ET_c$ for a crop under nonideal growing conditions including those having water stress or high soil salinity. In this paper, $ET_c$ representing ET under any condition, ideal or nonideal, is termed “actual $ET_c$ ” and is denoted as $ET_{c \text{ act}}$ . The $ET_{c \text{ act}}$ was termed “adjusted $ET_c$ ” ( $ET_{c \text{ adj}}$ ) in _FAO-56_. The terms are synonymous and

$$ET_{c \text{ act}} = K_{c \text{ act}} ET_0 \quad (3)$$

where $K_{c \text{ act}}$ = “actual” crop coefficient that includes any effects of environmental stresses.

A linearized form for mean $K_c$ and basal $K_c$ curves in _FAO-56_ was introduced in _FAO-24_ (Doorenbos and Pruitt 1977) where the FAO $K_c$ curve is comprised of four straight line segments representing the initial period, the development period, the midseason period, and the late season period (Fig. 1). These segments are defined by three primary $K_c$ values: $K_c$ during the initial period ( $K_{c \text{ ini}}$ ), $K_c$ during the midseason (full cover) period ( $K_{c \text{ mid}}$ ), and $K_c$ at harvest (or at the end of the late season) ( $K_{c \text{ end}}$ ). The $K_{c \text{ ini}}$ defines the horizontal portion of the $K_c$ curve during the initial period until approximately 10% of the ground is covered by vegetation. The $K_{c \text{ mid}}$ defines the value for $K_c$ during the peak period for the crop, which is normally when the crop is at “effective full cover.” This period is described by a horizontal line extending through $K_{c \text{ mid}}$ . The development period is defined by a sloping line that connects the initial and midseason periods. The late sea-

son has a sloping line that connects the end of the midseason period with the harvest (end) date.

In _FAO-56_, two forms for $K_c$ are presented: the “singular” $K_c$ form used in _FAO-24_ and the “dual” $K_c = K_{cb} + K_e$ form introduced in _FAO-56_, where $K_{cb}$ is the basal crop coefficient and $K_e$ is the soil evaporation coefficient. In the dual form, $K_{cb}$ represents the ratio of $ET_s$ to $ET_0$ under conditions when the soil surface layer is dry, but where the average soil water content of the root zone is adequate to sustain full plant transpiration. Under basal conditions, small amounts of evaporation from the surface soil layer occur by diffusion and are included in $K_{cb}$ (and thus $K_{cb \text{ ini}}$ is usually not set to zero during the growing cycle). The majority of evaporation from soil following wetting by precipitation or irrigation is represented by the separate $K_e$ . The total, actual $K_{c \text{ act}}$ is the sum of $K_{cb}$ and $K_e$ , reduced by any occurrence of soil water stress

$$K_{c \text{ act}} = K_s K_{cb} + K_e \quad (4)$$

where $K_{cb}$ and $K_e$ range from [0 to ~1.4]. The stress reduction coefficient $K_s$ [0–1], reduces $K_{cb}$ when the average soil water content or salinity level of the root zone are not conducive to sustain full plant transpiration. $K_s$ for soil water stress is described later and the function for salinity induced stress is described in Allen et al. (1998). The sum of $K_{cb}$ and $K_e$ cannot exceed some maximum value for a crop–soil complex (generally ~1.4 for _FAO-56_ based $ET_0$ ), based on energy limitations. The form and principle of Eq. (4) was developed by Jensen et al. (1971), Wright and Jensen (1978), and Wright (1981, 1982).

The $K_{cb}$ curve has the same shape as in Fig. 1 and three benchmark values for $K_{cb}$ are used to construct the curve, namely $K_{cb \text{ ini}}$ , $K_{cb \text{ mid}}$ , and $K_{cb \text{ end}}$ . Because $K_{cb}$ can include “diffusive” or residual evaporation from soil for potentially long periods following wetting, $K_{cb \text{ ini}}$ is generally set to 0.15 in _FAO-56_ for annual crops for the period from planting to before 10% ground cover. However, under dry conditions with long periods between wetting events or during the nongrowing season, $K_{cb \text{ ini}}$ can be set equal to 0. This is illustrated later.

_FAO-56_ describes the procedure for applying the dual method on a daily basis, with specific estimation of evaporation from wet soil. The dual approach is well suited for predicting the effects of day to day variation in soil water evaporation and the effectiveness of precipitation.

### Adjustment for Climate

_FAO-24_ (Doorenbos and Pruitt 1977) presented, for each crop listing, four values for singular midseason and end-of-season crop coefficients, termed in _FAO-56_ as $K_{c \text{ mid}}$ and $K_{c \text{ end}}$ . The four values represented four climatic cases of wind and humidity that impact the value for $K_e$ . In contrast, _FAO-56_ includes only single entries for $K_{c \text{ mid}}$ and for $K_{c \text{ end}}$ or, in the case of $K_{cb}$ , for $K_{cb \text{ mid}}$ and for $K_{cb \text{ end}}$ . The single entries correspond to $K_c$ or $K_{cb}$ values associated with a standard subhumid climate having average daytime minimum relative humidity ( $RH_{\text{min}}$ ) of about 45% and having calm to moderate wind speeds of 1–3 m s<sup>-1</sup>, averaging 2 m s<sup>-1</sup>. $K_c$ and $K_{cb}$ values are listed for about 80 crops in _FAO-56_. These can be accessed on the FAO web site (FAO 1998).

For climates where mean $RH_{\text{min}}$ is different from 45% or where wind speed at 2 m ( $u_2$ ) is different from 2.0 m s<sup>-1</sup>, $K_{cb \text{ mid}}$ values from _FAO-56_ are adjusted as

$$K_{cb \text{ mid}} = K_{cb \text{ mid}} (\text{standard climate})$$

$$+ [0.04(u_2 - 2) - 0.004(RH_{\min} - 45)] \left( \frac{h}{3} \right)^{0.3} \quad (5)$$

where $K_{cb \text{ mid}}(\text{standard climate}) = \text{value for } K_{cb \text{ mid}} \text{ from Table 17 of FAO-56}$ ; $u_2 = \text{mean daily wind speed at 2 m height (m s}^{-1}\text{)}$ ; $RH_{\min} = \text{mean daily minimum relative humidity (\%)} \text{ during the midseason period}$ ; and $h = \text{mean plant height during the midseason period (m)}$ . The adjustment in Eq. (5) accounts for impacts of differences in aerodynamic roughness between crops and the grass reference with changing climate and closely replicates the range in $K_c$ values for the four climatic classes of FAO-24. Justification for Eq. (5) is given in Allen et al. (1998). Similar adjustment is made to $K_{cb \text{ end}}$ when values for $K_{cb \text{ end}} > 0.45$ . Eq. (5) can be applied daily using daily values for $u_2$ and $RH_{\min}$ or can be applied for the midseason in total using averages for $u_2$ and $RH_{\min}$ for the period with relatively small loss in accuracy. When only mean daily dewpoint temperature or vapor pressure is known, $RH_{\min}$ can be approximated as $RH_{\min} \sim 100e_a/e^0(T_{\max})$ , where $e_a$ is actual vapor pressure and $e^0(T_{\max})$ is saturation vapor at daily maximum air temperature. The crop height adjustment in Eq. (5) is applied to both the wind and the $RH_{\min}$ terms because both terms appear in the aerodynamic term of the Penman–Monteith equation and both factors influence ET in some proportion to aerodynamic roughness.

### Evaporation from Soil

The approach of FAO-56 is similar to that of Ritchie (1972), Saxton et al. (1974), and Wright (1982) where evaporation from soil beneath a canopy or inbetween plants is predicted by estimating the amount of energy at the soil surface in conjunction with energy consumed by transpiration. When the soil is wet, evaporation is predicted to occur at some maximum rate and the sum $K_c = K_{cb} + K_e$ is limited by some maximum value $K_{c \text{ max}}$ .

As the surface soil layer dries, a reduction in evaporation occurs, and $K_e$ is simulated as

$$K_e = K_r(K_{c \text{ max}} - K_{cb}) \leq f_{ew}K_{c \text{ max}} \quad (6)$$

where $K_{c \text{ max}} = \text{maximum value of } K_c \text{ following rain or irrigation}$ ; $K_r = \text{dimensionless evaporation reduction coefficient and is dependent on the cumulative depth of water depleted (evaporated)}$ ; and $f_{ew} = \text{fraction of the soil that is both exposed to solar radiation and that is wetted}$ . Evaporation is restricted by the energy available at the exposed soil fraction, i.e., $K_e$ cannot exceed $f_{ew}K_{c \text{ max}}$ . The FAO-56 dual procedure differs from Ritchie (1972) and Saxton et al. (1974) in that the FAO procedure gives $K_e$ (as limited by $f_{ew}K_{c \text{ max}}$ ) equal priority to transpiration (as represented by $K_{cb}$ ) in regard to energy consumption, whereas the Ritchie and Saxton approaches give transpiration priority over evaporation.

$K_{c \text{ max}}$ represents an upper limit on evaporation and transpiration from the cropped surface and is introduced to reflect the natural constraints on available energy. $K_{c \text{ max}}$ ranges from about 1.05 to 1.30 when using the grass reference ET<sub>0</sub>

$$K_{c \text{ max}} = \max \left\{ \left\{ 1.2 + [0.04(u_2 - 2) - 0.004(RH_{\min} - 45)] \left( \frac{h}{3} \right)^{0.3} \right\}, \{K_{cb} + 0.05\} \right\} \quad (7)$$

where $h = \text{mean plant height during the period of calculation (initial, development, mid-season, or late-season) (m)}$ , and the $\max()$

function indicates the selection of the maximum of values separated by the comma. Eq. (7) ensures that $K_{c \text{ max}}$ is always greater than or equal to the sum $K_{cb} + 0.05$ , suggesting that wet soil always increases the $K_c$ value above $K_{cb}$ by 0.05 following complete wetting of the soil surface, even during periods of full ground cover. The value 1.2 represents the impact of reduced albedo of wet soil and the contribution of heat stored in dry soil prior to wetting events that are separated by more than 3 or 4 days. The value also considers the effect of increased aerodynamic roughness of surrounding crops during development, mid-season, and late season growth stages which can increase the turbulent transfer of vapor from the exposed soil surface. Bonachela et al. (2001) noted $K_{c \text{ max}}$ of over 1.5 for soil evaporation from a drip-irrigated olive orchard caused by microadvection of heat from dry surface areas to wet surface areas. Under complete surface wetting, $K_{c \text{ max}}$ would be expected to be lower, for example ranging from 1.0 to 1.2. In addition, if irrigation or precipitation events are more frequent than 3 days each, for example daily or 2 days each, then the soil has less opportunity to absorb heat between wetting events, and the 1.2 value can be reduced to about 1.1.

The surface soil layer is presumed to dry to an air dry water content approximated as halfway between wilting point $\theta_{WP}$ and oven dry. The amount of water that can be removed by evaporation during a complete drying cycle is estimated as

$$TEW = 1000(\theta_{FC} - 0.5\theta_{WP})Z_e \quad (8)$$

where (total evaporable water) (TEW) = maximum depth of water that can be evaporated from the surface soil layer when the layer has been initially completely wetted (mm). Field capacity $\theta_{FC}$ and $\theta_{WP}$ are expressed in ( $\text{m}^3 \text{ m}^{-3}$ ) and $Z_e(\text{m}) = \text{effective depth of the surface soil subject to drying to } 0.5 \theta_{WP} \text{ by way of evaporation}$ . Typical values for $\theta_{FC}$ , $\theta_{WP}$ , and TEW are given in Table 1 for various soil types. $Z_e$ is an empirical value based on observation. FAO-56 recommended values for $Z_e$ of 0.10–0.15 m, with 0.1 m recommended for coarse soils and 0.15 m recommended for fine textured soils. However, the user should select the value for $Z_e$ , or even TEW, that represents evaporation amounts observed over complete drying cycles via gravimetric or other measurement. Some evaporation or soil drying will be observed to occur below the $Z_e$ depth.

Evaporation from exposed soil is presumed to take place in two stages: an energy limiting stage (Stage 1), and a falling rate stage (Stage 2) (Philip 1957 and Ritchie 1972). During Stage 1, the soil surface remains wet and evaporation is predicted to occur at the maximum rate limited only by energy availability at the soil surface and therefore, $K_e = 1$ . As the soil surface dries, the evaporation rate decreases below the potential evaporation rate (defined as $K_{c \text{ max}} - K_{cb}$ ), and $K_e$ becomes less than one. $K_r$ becomes zero when no water is left for evaporation in the evaporation layer.

Stage 1 holds until the cumulative depth of evaporation $D_e$ is such that the hydraulic properties of the upper soil become limiting and water cannot be transported to near the soil surface at a rate to supply the demand. At the end of Stage 1 drying, $D_e$ is equal to readily evaporable water (REW). Readily evaporable water normally ranges from 5 to 12 mm and is highest for medium and fine textured soils (Ritchie 1972; Ritchie et al. 1989).

The second stage, where $K_e$ is decreasing, begins when $D_e$ exceeds REW. At this point, the soil surface is visibly dry, and evaporation from the exposed soil decreases in proportion to the amount of water remaining in the surface soil layer. Most early Stage 2 models (Philip 1957; Ritchie 1972) proportion the evaporation rate according to the square root of time since the begin-

**Table 1.** Typical Soil Water Characteristics for Different Soil Types (from _FAO-56_)

| Soil type<br>(USDA<br>soil texture<br>classification) | Soil water characteristics     |                                |                                              | Evaporation parameters |                                                                 |                                                                 |
| ----------------------------------------------------- | ------------------------------ | ------------------------------ | -------------------------------------------- | ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
|                                                       | $\theta_{FC}$<br>$m^3\ m^{-3}$ | $\theta_{WP}$<br>$m^3\ m^{-3}$ | $(\theta_{FC}-\theta_{WP})$<br>$m^3\ m^{-3}$ | Stage 1<br>REW<br>(mm) | Stages 1 and 2<br>TEW <sup>a</sup><br>( $Z_c=0.10\ m$ )<br>(mm) | Stages 1 and 2<br>TEW <sup>a</sup><br>( $Z_c=0.15\ m$ )<br>(mm) |
| Sand                                                  | 0.07–0.17                      | 0.02–0.07                      | 0.05–0.11                                    | 2–7                    | 6–12                                                            | 9–13                                                            |
| Loamy sand                                            | 0.11–0.19                      | 0.03–0.10                      | 0.06–0.12                                    | 4–8                    | 9–14                                                            | 13–21                                                           |
| Sandy loam                                            | 0.18–0.28                      | 0.06–0.16                      | 0.11–0.15                                    | 6–10                   | 15–20                                                           | 22–30                                                           |
| Loam                                                  | 0.20–0.30                      | 0.07–0.17                      | 0.13–0.18                                    | 8–10                   | 16–22                                                           | 24–33                                                           |
| Silt loam                                             | 0.22–0.36                      | 0.09–0.21                      | 0.13–0.19                                    | 8–11                   | 18–25                                                           | 27–37                                                           |
| Silt                                                  | 0.28–0.36                      | 0.12–0.22                      | 0.16–0.20                                    | 8–11                   | 22–26                                                           | 33–39                                                           |
| Silt clay loam                                        | 0.30–0.37                      | 0.17–0.24                      | 0.13–0.18                                    | 8–11                   | 22–27                                                           | 33–40                                                           |
| Silty clay                                            | 0.30–0.42                      | 0.17–0.29                      | 0.13–0.19                                    | 8–12                   | 22–28                                                           | 33–42                                                           |
| Clay                                                  | 0.32–0.40                      | 0.20–0.24                      | 0.12–0.20                                    | 8–12                   | 22–29                                                           | 33–43                                                           |

Note: USDA=United States Department of Agriculture; REW=readily evaporated water; and TEW=totally evaporated water.

<sup>a</sup>TEW=( $\theta_{FC}-0.5\theta_{WP}$ ) $Z_c$ .

ning of Stage 2. This requires manipulation of time terms as new water enters the system. Moreover, the proportionality factor changes with $ET_0$ demand and therefore requires frequent recalibration (Snyder et al. 2000). In the _FAO-56_ model, the reduction in evaporation during Stage 2 is proportional to the cumulative evaporation from the surface soil layer, resulting in a more simple, easily managed computation procedure that is based on a soil–water balance and that does not require recalibration

$$K_r = \frac{TEW - D_{e,j-1}}{TEW - REW} \tag{9}$$

for $D_{e,j-1} > REW$ , where $D_{e,j-1}$ =cumulative depletion from the soil surface layer at the end of day $j-1$ (the previous day) (mm); and TEW and REW are in millimeters ( $REW < TEW$ ). The general form for the $K_r$ function is illustrated in Fig. 2. The prediction by Eq. (9) is similar to that predicted by a square-root-of-time Stage 2 model, and differences are in general smaller than the uncertainties caused by the continuously changing effects of soil

hydraulic properties, tillage, soil temperature, wetting characteristics, and root extraction. Saxton et al. (1974) used a nonlinear proportionality based on water content of the surface layer that had similar behavior as Eq. (9). A three-stage drying process can be applied to cracking soils as described in a following section. Mutziger et al. (2001) found good agreement between $K_r$ predicted using the _FAO-56_ dual method using REW and TEW from Table 1 (with $Z_c=0.1\ m$ ) and relative evaporation measurements published by Chanzy and Bruckler (1993) for loam, silty clay loam, and clay soils.

In crops having partial ground cover, evaporation from the soil usually occurs nonuniformly over the surface, and is greater between plants having dense canopies near the ground where exposure to sunlight occurs and where more air ventilation is able to transport vapor from the soil surface to above the canopy. This is especially true where only part of the soil surface is wetted by irrigation. While it is recognized that both the locations and the fractions of the soil surface exposed to sunlight and ventilation may change with the time of day and depend on row orientation and near surface canopy density, the procedure of _FAO-56_ predicts a general, averaged fraction of soil surface from which the majority of evaporation is expected to occur. Most evaporation from the soil beneath the crop canopy, occurring at a slower rate, is in many situations included in the basal $K_{cb}$ coefficient.

**Table 2.** Common Values for Fraction of Soil Surface Wetted by Irrigation or Precipitation (after _FAO-56_)

| Wetting event                                | $f_w$   |
| -------------------------------------------- | ------- |
| Precipitation                                | 1.0     |
| Sprinkler irrigation, field crops            | 1.0     |
| Sprinkler irrigation, orchards               | 0.7–1.0 |
| Basin irrigation                             | 1.0     |
| Border irrigation                            | 1.0     |
| Furrow irrigation (every furrow), narrow bed | 0.6–1.0 |
| Furrow irrigation (every furrow), wide bed   | 0.4–0.6 |
| Furrow irrigation (alternated furrows)       | 0.3–0.5 |
| Microspray irrigation, orchards              | 0.5–0.8 |
| Trickle (drip) irrigation                    | 0.3–0.4 |

![Figure 2: General function for soil evaporation reduction coefficient K_r for two-stage FAO-56 model. The graph plots K_r (y-axis, 0.00 to 1.00) against D_e, cumulative depth of evaporation (depletion) (x-axis, 0 to TEW). A horizontal line at K_r = 1.00 is labeled 'energy limiting stage'. A diagonal line from (0, 1.00) to (TEW, 0.00) is labeled 'falling rate stage'. A horizontal line at K_r = 0.20 is labeled 'REW'. A horizontal line at K_r = 0.00 is labeled 'TEW'. The area between K_r = 0.20 and K_r = 0.00 is labeled 'TEW'. The area between K_r = 1.00 and K_r = 0.20 is labeled 'REW'.](c82c7d8107cba121734a9cfba891216d_img.jpg)

Figure 2: General function for soil evaporation reduction coefficient K_r for two-stage FAO-56 model. The graph plots K_r (y-axis, 0.00 to 1.00) against D_e, cumulative depth of evaporation (depletion) (x-axis, 0 to TEW). A horizontal line at K_r = 1.00 is labeled 'energy limiting stage'. A diagonal line from (0, 1.00) to (TEW, 0.00) is labeled 'falling rate stage'. A horizontal line at K_r = 0.20 is labeled 'REW'. A horizontal line at K_r = 0.00 is labeled 'TEW'. The area between K_r = 0.20 and K_r = 0.00 is labeled 'TEW'. The area between K_r = 1.00 and K_r = 0.20 is labeled 'REW'.

**Fig. 2.** General function for soil evaporation reduction coefficient $K_r$ for two-stage _FAO-56_ model (from _FAO-56_)

![Figure 3: Determination of f_ew (greyed areas) as function of fraction of ground surface coverage (f_c) and fraction of surface wetted (f_w). The diagram shows three irrigation methods: Rain, Basin Border Sprinkler, and Drip. For each method, it compares 'initial crop development' and 'mid and late season' states. In the initial state, f_ew = (1 - f_c) for Rain and Basin Border Sprinkler, and f_ew = f_w for Drip. In the mid and late season state, f_ew = (1 - f_c) for Rain and Basin Border Sprinkler, and f_ew = 1.0 for Drip. The diagram also shows the relationship f_ew = (1 - f_c) for Rain and Basin Border Sprinkler, and f_ew = f_w for Drip.](547f726730e589392f239257a833ede3_img.jpg)

Figure 3: Determination of f_ew (greyed areas) as function of fraction of ground surface coverage (f_c) and fraction of surface wetted (f_w). The diagram shows three irrigation methods: Rain, Basin Border Sprinkler, and Drip. For each method, it compares 'initial crop development' and 'mid and late season' states. In the initial state, f_ew = (1 - f_c) for Rain and Basin Border Sprinkler, and f_ew = f_w for Drip. In the mid and late season state, f_ew = (1 - f_c) for Rain and Basin Border Sprinkler, and f_ew = 1.0 for Drip. The diagram also shows the relationship f_ew = (1 - f_c) for Rain and Basin Border Sprinkler, and f_ew = f_w for Drip.

**Fig. 3.** Determination of $f_{ew}$ (greyed areas) as function of fraction of ground surface coverage ( $f_c$ ) and fraction of surface wetted ( $f_w$ ) (from FAO-56)

In the FAO-56 model, the term $f_w$ is defined as the fraction of the surface wetted by irrigation and/or precipitation. This term defines the potential spatial extent of evaporation. Common values for $f_w$ are listed in Table 2. An extension to Eq. (10) is described later.

When the soil surface is completely wetted, as by precipitation or sprinkler, $f_{ew}$ of Eq. (6) is set equal to $(1 - f_c)$ , where $f_c$ is the fraction of soil surface effectively covered by vegetation and $(1 - f_c)$ represents the approximate fraction of soil surface that is effectively exposed to evaporation energy. For irrigation systems where only a fraction of the ground surface ( $f_w$ ) is wetted, $f_{ew}$ is limited to $f_w$

$$f_{ew} = \min(1 - f_c, f_w) \quad (10)$$

Both $1 - f_c$ and $f_w$ , for numerical stability, have limits of [0.01–1]. The limitation imposed by Eq. (10) presumes the fraction of soil wetted by irrigation occurs within the primary fraction of soil exposed to sunlight and ventilation. This is generally the case, except with some drip irrigation (Fig. 3). In the case of drip irrigation, Allen et al. (1998) recommended multiplying $f_w$ by $[1 - (2/3)f_c]$ . Pruitt et al. (1984) and Bonachela et al. (2001) have described evaporation patterns and extent under drip irrigation.

### Predicting Fraction of Surface Cover

The difference $(1 - f_c)$ represents the fraction of the soil effectively exposed to sunlight and air ventilation and serves as the site where the majority of evaporation is expected to occur. The value for $f_c$ is limited to $<0.99$ for numerical stability and is generally determined by visual observation. For purposes of estimating $f_{ew}$ , $f_c$ can be estimated from $K_{cb}$ as

![Figure 4: Water balance of soil surface layer. The diagram shows a cross-section of the soil surface layer with a plant. Rain and irrigation are shown as downward arrows. Evaporation (E) and transpiration (T) are shown as upward arrows. The soil surface layer is shaded grey. The diagram also shows the relationship T = K_{cb}ET_0 and E = K_eET_0. The diagram also shows the relationship T = K_{cb}ET_0 and E = K_eET_0.](6df5629bc2fc6d82f1a1edf9d7340113_img.jpg)

Figure 4: Water balance of soil surface layer. The diagram shows a cross-section of the soil surface layer with a plant. Rain and irrigation are shown as downward arrows. Evaporation (E) and transpiration (T) are shown as upward arrows. The soil surface layer is shaded grey. The diagram also shows the relationship T = K\_{cb}ET_0 and E = K_eET_0. The diagram also shows the relationship T = K\_{cb}ET_0 and E = K_eET_0.

**Fig. 4.** Water balance of soil surface layer (from FAO-56)

$$f_c = \left( \frac{K_{cb} - K_{c \min}}{K_{c \max} - K_{c \min}} \right)^{(1+0.5h)} \quad (11)$$

where $f_c$ is limited to [0–0.99] and $K_{c \min}$ =minimum $K_c$ for dry bare soil with no ground cover. Eq. (11) assumes that the value for $K_{cb}$ is largely governed by the fraction of vegetation cover. The $1+0.5h$ exponent in Eq. (11) represents the impact of plant height on shading of the soil surface and in increasing the value for $K_{cb}$ , given a specific value for $f_c$ . The difference $K_{cb} - K_{c \min}$ is limited to $\geq 0.01$ for numerical stability. The value for $f_c$ will change daily as $K_{cb}$ changes. $K_{c \min}$ ordinarily has the same value as $K_{cb \text{ ini}}$ used for annual crops under nearly bare soil conditions (i.e., $K_{c \min} \sim 0.15$ ). The value for $f_c$ decreases during the late season period in proportion to $K_{cb}$ to account for local transport of sensible heat from senescing leaves to the soil surface.

Under vegetation having an open canopy near the ground surface, for example some types of orchards, a large proportion, if not all, of the ground surface is effectively exposed to evaporative energy (Bonachela et al. 2001). In these situations, $1 - f_c$ does not have large impact on $f_{ew}$ , and $f_{ew} = f_w$ can be applied. The decision in assigning values for $f_c$ and $f_{ew}$ should be based on field observation of drying patterns.

### Water Balance of Soil Surface Layer

Calculation of $K_e$ requires a daily water balance for the $f_{ew}$ fraction of the surface soil layer. The daily soil water balance equation is (Fig. 4)

$$D_{e,j} = D_{e,j-1} - (P_j - RO_j) - \frac{I_j}{f_w} + \frac{E_j}{f_{ew}} + T_{ci,j} + DP_{ci,j} \quad (12)$$

where $D_{e,j-1}$ and $D_{e,j}$ =cumulative depletion depth at the ends of days $j-1$ and $j$ (mm); $P_j$ and $RO_j$ =precipitation and precipitation runoff from the soil surface on day $j$ (mm); $I_j$ =irrigation depth on day $j$ that infiltrates the soil (mm); $E_j$ =evaporation on day $j$ (i.e., $E_j = K_e ET_0$ ) (mm); $T_{ci,j}$ =depth of transpiration from the exposed and wetted fraction of the soil surface layer on day $j$ (mm); and $DP_{ci,j}$ =deep percolation from the soil surface layer on day $j$ if soil water content exceeds field capacity (mm). Assuming that the surface layer is at field capacity following heavy rain or irrigation, the minimum value for $D_{e,j}$ is zero and limits imposed are $0 \leq D_{e,j} \leq TEW$ . It is recognized that water content of the soil surface layer can exceed TEW for short periods of time while drain-

age is occurring. However, because the length of time that this occurs varies with soil texture, wetting depth, and tillage, $D_{e,j} \geq 0$ is assumed. Additionally, it is recognized that some drainage in soil occurs at very small rates at water contents below field capacity. To some extent, impacts of these simple assumptions can be compensated for, if needed, in setting the value for $Z_e$ or TEW.

$RO_j$ can be computed using the USDA curve number procedure (Hawkins et al. 1985). The irrigation depth $I_j$ is divided by $f_w$ to approximate the infiltration depth to the $f_w$ portion of the soil surface. Similarly, $E_j$ is divided by $f_{ew}$ because it is assumed that all $E_j$ (other than residual evaporation implicit to the $K_{cb}$ coefficient) is taken from the $f_{ew}$ fraction of the surface layer.

Except for shallow rooted crops, where the depth of the maximum rooting is less than 0.5–0.6 m, the amount of transpiration extracted from the $f_{ew}$ portion of the surface soil layer is small and can be ignored (i.e., $T_{ci}=0$ ). Where transpiration is known to extract water from the $f_{ew}$ fraction of the surface layer, but is not considered in Eq. (12), _FAO-56_ advises that the depth of the surface layer $Z_s$ be decreased to compensate for the quicker drying. Estimation of $T$ from the $f_{ew}$ fraction of the surface layer is described in a following section.

Following heavy rain or irrigation, the soil water content in the surface layer ( $Z_e$ layer) might exceed field capacity for short time periods until excess water moves into the root zone and perhaps even deeper. In the simple water balance procedure used in _FAO-56_, however, it is assumed that the soil water content is limited to $\leq \theta_{FC}$ on the day of a complete wetting event. This is a reasonable assumption considering the shallowness of the surface layer. Downward drainage (percolation) of water from the surface layer is calculated as

$$DP_{e,j} = (P_j - RO_j) + \frac{I_j}{f_w} - D_{e,j-1} \geq 0 \quad (13)$$

As long as the soil water content in the evaporation layer is below field capacity (i.e., $D_{e,j} > 0$ ), the surface layer is assumed to not drain, and $DP_{e,j} = 0$ .

### Initialization of Water Balance

To initiate the water balance for the evaporating layer, the user can assume that the soil surface layer is near $\theta_{FC}$ following a heavy rain or irrigation so that $D_{e,j-1} = 0$ . Where a long period of time has elapsed since the last wetting, the user can assume that all evaporable water has been depleted from the evaporation layer at the beginning of calculations so that $D_{e,j-1} = TEW = 1,000(\theta_{FC} - 0.5 \theta_{wp}) Z_e$ .

### Order of Calculation

Calculations for the _FAO-56_ dual $K_{cb} + K_e$ procedure, for example when using a spreadsheet, proceed in the following order: $K_{cb}$ , $h$ , $K_{c \max}$ , $f_{ci}$ , $f_{wi}$ , $f_{ew}$ , $K_r$ , $K_e$ , $E$ , $DP_e$ , $I_e$ , $I_c$ , and $ET_c$ .

### Extensions to FAO-56 Procedure

The evaporation component of the _FAO-56_ dual $K_e$ procedure was intended for routine application under a wide range of conditions. The procedure constitutes a balance between simplicity, under-standability, and completeness and is recommended for most ap-

plications. The following three extensions to the _FAO-56_ procedure may increase accuracy and definition of the total evaporation and drying process under special conditions.

### Separate Prediction of Evaporation from Soil Wetted by Precipitation Only

The evaporation component is assumed to be fully concentrated in the exposed and wetted fraction of the surface layer. The slower rate of evaporation occurring from beneath the vegetation canopy is generally included in $K_{cb}$ and is therefore not explicitly quantified. $E$ is computed as $K_e ET_p$ . The quotient $E/f_{ew}$ in Eq. (12) describes the concentration of evaporation over the fraction of the soil that is both exposed and wetted.

Parameter $f_{wi}=1$ for precipitation but is often $<1$ for some types of surface irrigation and micro irrigation. _FAO-56_ recommended a procedure for calculating $f_w$ according to the type of last wetting event and its extent. However, this determination can be subjective and uncertain. This section describes an extension to _FAO-56_ that incorporates a separate water balance and procedure for $K_r$ for the fraction of soil that is wetted by precipitation only (i.e., not by irrigation). The extension reduces uncertainty in determining the value for $f_w$ and has been applied by Mutziger et al. (2005) in estimating annual evaporation losses from agricultural areas in California.

In the extension to the _FAO-56_ procedure, the evaporation calculation is divided into two separate calculations. One calculation is made for the exposed fraction of soil wetted by both irrigation and precipitation and one calculation is made for the exposed fraction of soil wetted by precipitation only. The coefficient $K_e$ is calculated as

$$K_e = K_{ei} + K_{ep} \quad (14)$$

where $K_{ei}$ =evaporation coefficient for the exposed fraction of the soil wetted by both irrigation and by precipitation and $K_{ep}$ =evaporation coefficient for the exposed fraction of the soil wetted by precipitation only.

The modification to Eq. (6) that applies to the fraction wetted by both irrigation and by precipitation is

$$K_{ei} = K_{ri} W(K_{c \max} - K_{cb}) \leq f_{ewi} K_{c \max} \quad (15)$$

and the application of Eq. (6) to the fraction of soil that is exposed and wetted by precipitation only is

$$K_{ep} = K_{rp}(1 - W)(K_{c \max} - K_{cb}) \leq f_{ewp} K_{c \max} \quad (16)$$

where $f_{ewi}$ =fraction of soil wetted by both irrigation and precipitation and is exposed to rapid drying due to exposure to solar radiation and/or ventilation; $f_{ewp}$ =fraction of soil exposed to rapid drying and is wetted by precipitation only; $W$ =weighting coefficient for partitioning the energy available for evaporation into the $f_{ewi}$ and $f_{ewp}$ soil fractions, depending on water availability; $K_{ri}$ and $K_{rp}$ =evaporation reduction coefficients for the $f_{ewi}$ and $f_{ewp}$ fractions; and $f_{ewp}$ is calculated as

$$f_{ewp} = 1 - f_c - f_{ewi} \quad (17)$$

and $f_{ewp}$ and $f_{ewi}$ are limited to 0.001–1.0. Eq. (10) is reexpressed for $f_{ewi}$ as

$$f_{ewi} = \min(1 - f_c, f_w) \quad (18)$$

where $1 - f_c$ has limits of [0.01–1] and $f_w$ =average fraction of soil surface wetted by irrigation, only [0.01–1].

The weighting factor $W$ is calculated according to water availability in the two wetted, exposed fractions of the surface layer

$$W = \frac{1}{1 + \frac{f_{\text{ewp}}(TEW - D_{\text{ep}})}{f_{\text{ewi}}(TEW - D_e)}} \quad (19)$$

where $D_e$ = cumulative depletion depth (mm) from the evaporating layer for the $f_{\text{ewi}}$ fraction of soil; and $D_{\text{ep}}$ = cumulative depletion depth (mm) from the evaporating layer for the $f_{\text{ewp}}$ fraction of soil. The limits $D_e$ and $D_{\text{ep}} < TEW$ ; $D_e$ and $D_{\text{ep}} \geq 0$ ; and $f_{\text{ewi}}(TEW - D_e) > 0.001$ are imposed for numerical stability.

An associated water balance is computed for the fraction of the evaporation layer wetted by precipitation, but not by irrigation, and is in the exposed portion of the soil

$$D_{\text{ep},j} = D_{\text{ep},j-1} - (P_j - RO_j) + \frac{E_{p,j}}{f_{\text{ewp}}} + T_{\text{ep},j} + DP_{\text{ep},j} \quad (20)$$

where $D_{\text{ep},j-1}$ and $D_{\text{ep},j}$ = cumulative depletion depths at the ends of days $j-1$ and $j$ in the $f_{\text{ewp}}$ fraction of the surface (mm); $E_{p,j}$ = evaporation from $f_{\text{ewp}}$ fraction on day $j$ ( $E_{p,j} = K_{\text{ep}} ET_0$ ) (mm); $T_{\text{ep},j} = T_e$ from $f_{\text{ewp}}$ fraction of the evaporation layer on day $j$ (mm); ( $T_{\text{ep},j}$ can be set equal to zero for simplification); and $DP_{\text{ep},j}$ = deep percolation from the $f_{\text{ewp}}$ fraction of the evaporation layer on day $j$ if soil water content exceeds $\theta_{\text{FC}}$ (mm). The limits on $D_{\text{ep},j}$ are $0 \leq D_{\text{ep},j} \leq TEW$ . The $E_{p,j}$ is divided by $f_{\text{ewp}}$ because it is assumed that all $E_p$ is taken from the $f_{\text{ewp}}$ fraction of the surface layer.

Eq. (12) is expressed for the $f_{\text{ewi}}$ fraction as

$$D_{e,j} = D_{e,j-1} - (P_j - RO_j) - \frac{I_j}{f_w} + \frac{E_j}{f_{\text{ewi}}} + T_{e,i,j} + DP_{e,i,j} \quad (21)$$

where $f_w$ = fraction of soil surface wetted by irrigation.

Eq. (9) is expressed for the $f_{\text{ewi}}$ and $f_{\text{ewp}}$ fractions as

$$K_{\text{ri}} = \frac{TEW - D_{e,j-1}}{TEW - REW} \quad (22)$$

and

$$K_{\text{p}} = \frac{TEW - D_{\text{ep},j-1}}{TEW - REW} \quad (23)$$

for $D_{e,j-1}$ and $D_{\text{ep},j-1} \geq 0$ .

The total evaporation rate from the exposed fraction of the surface is $E = K_e ET_0 = (K_{\text{ei}} + K_{\text{ep}}) ET_0$ . $K_{\text{ei}}$ and $K_{\text{ep}}$ are both constrained so that $K_{\text{ei}} \geq 0$ and $K_{\text{ep}} \geq 0$

Eq. (13) is expressed for the $f_{\text{ewi}}$ fraction of the surface layer as

$$DP_{e,i,j} = (P_j - RO_j) + \frac{I_j}{f_w} - D_{e,i,j-1} \geq 0 \quad (24)$$

As long as the soil water content in the evaporation layer is below field capacity (i.e., $D_{e,i,j} > 0$ ), the soil will not drain and $DP_{e,i,j} = 0$ . For the fraction of exposed soil that is wetted by precipitation but not by irrigation

$$DP_{\text{ep},j} = (P_j - RO_j) - D_{\text{ep},j-1} \geq 0 \quad (25)$$

### Transpiration from Surface Layer

The amount of transpiration extracted from the $f_{\text{ew}}$ fraction of the evaporating soil layer is generally small and can be ignored. However, for shallow-rooted annual crops where the depth of the maximum rooting is less than about 0.5 m, $T_e$ may have signifi-

cant effect on the water balance of the surface layer and therefore on prediction of the evaporation component, especially for the period midway through the development period.

Under conditions of uniform water availability within the soil profile, the ratio of $T$ extracted from the evaporation layer to total $T$ is presumed proportional to $(Z_e/Z_r)^{0.6}$ (Allen et al. 1996), where $Z_e$ is the depth of the surface evaporation layer and $Z_r$ is the effective depth of the root zone ( $Z_e \leq Z_r$ and $Z_e$ is contained in $Z_r$ ). This relationship is based on the commonly used 40–30–20–10% root extraction pattern for quartile rooting depths (top to bottom) of the root zone for moist soils.

In this extension, it is assumed that the previous extension using $f_{\text{ewi}}$ and $f_{\text{ewp}}$ is applied. If this is not the case, then only $T_{\text{ei}}$ is used and all occurrences of $f_{\text{ewi}}$ are set to $f_{\text{ew}}$ . The equation for $T_e$ from the $f_{\text{ewi}}$ fraction of the evaporation layer $T_{\text{ei}}$ is

$$T_{\text{ei}} = K_{\text{ti}} K_{\text{cb}} K_s ET_0 \quad (26)$$

where $K_{\text{ti}}$ , $[0-1]$ = proportion of basal $ET (= K_{\text{cb}} ET_0)$ extracted as transpiration from the $f_{\text{ewi}}$ fraction of the surface soil layer, and $K_s$ = soil water stress factor computed for the root zone $[0-1]$ . $K_{\text{ti}}$ is determined by comparing relative water availability in the $Z_e$ and $Z_r$ layers along with the presumed rooting distribution. For the $f_{\text{ewi}}$ fraction

$$K_{\text{ti}} = \left( \frac{1 - \frac{D_e}{TEW}}{1 - \frac{D_r}{TAW}} \right) \left( \frac{Z_e}{Z_r} \right)^{0.6} \quad (27)$$

where the numerator and denominator of the first expression of Eq. (27) are limited to $\geq 0.001$ and TAW is total available water in the root zone [see Eq. (33) introduced later]. In addition, the value for $K_{\text{ti}}$ is limited to $\leq 1.0$ to limit $T_{\text{ei}}$ to $\leq ET_0$ . A value of $K_{\text{ti}} \sim 1.0$ would represent conditions where the soil profile is near wilting point, but the shallow surface layer is partially or fully rehydrated by a light precipitation or irrigation event, or where the root zone is very shallow.

Transpiration from the $f_{\text{ewp}}$ fraction of the soil $T_{\text{ep}}$ is calculated as

$$T_{\text{ep}} = K_{\text{tp}} K_{\text{cb}} K_s ET_0 \quad (28)$$

where

$$K_{\text{tp}} = \left( \frac{1 - \frac{D_{\text{ep}}}{TEW}}{1 - \frac{D_r}{TAW}} \right) \left( \frac{Z_e}{Z_r} \right)^{0.6} \quad (29)$$

where $K_{\text{tp}}$ , $[0-1]$ = proportion of basal $ET (= K_{\text{cb}} ET_0)$ extracted as transpiration from the $f_{\text{ewp}}$ fraction of the surface soil layer. The same limitations apply as for Eq. (27).

When there is Stage 3 evaporation, as defined in the next section, TEW in Eqs. (27) and (29) is set equal to TEW<sub>3</sub>, the upper limit for evaporable water.

### Stage Three Evaporation

The third extension to the FAO-56 procedure applies to soils that crack substantially upon drying, thereby exposing progressively deeper depths of soil to drying by evaporation. This progressive drying continues at a low rate for an extended period of time. Drying to depths as deep as 0.5 m is possible for severely cracking soils containing large amounts of montmorillonite clay where cracks can extend as deep as 1 m (Pettry and Switzer 1996).

![Fig. 5. General schematic showing evaporation reduction coefficient K_r as function of depth of water evaporated (depleted) from surface soil layer for cracking soil having three-stage evaporation. The graph shows K_r on the y-axis (0 to 1) and D_e cumulative depth of evaporation on the x-axis (0 to TEW_3). Stage 1 is a constant K_r = 1 from 0 to REW. Stage 2 is a linear decrease from K_r = 1 at REW to K_r = K_{r2} at TEW_2. Stage 3 is a linear decrease from K_r = K_{r2} at TEW_2 to K_r = 0 at TEW_3. A note for Stage 3 says '(deep drying in cracks)'.](352c5fab6f936356e9570761a02ab71e_img.jpg)

Fig. 5. General schematic showing evaporation reduction coefficient K_r as function of depth of water evaporated (depleted) from surface soil layer for cracking soil having three-stage evaporation. The graph shows K_r on the y-axis (0 to 1) and D_e cumulative depth of evaporation on the x-axis (0 to TEW_3). Stage 1 is a constant K_r = 1 from 0 to REW. Stage 2 is a linear decrease from K_r = 1 at REW to K_r = K\_{r2} at TEW_2. Stage 3 is a linear decrease from K_r = K\_{r2} at TEW_2 to K_r = 0 at TEW_3. A note for Stage 3 says '(deep drying in cracks)'.

**Fig. 5.** General schematic showing evaporation reduction coefficient $K_r$ as function of depth of water evaporated (depleted) from surface soil layer for cracking soil having three-stage evaporation.

In the extension for cracking soils, the evaporation process is expanded from two to three stages. The three stages are illustrated in Fig. 5. For normal agricultural soils that do not crack or only mildly crack, only Stage 1 and Stage 2 drying is applied. For cracking soils that have Stage 3 drying, Stage 3 is presumed to begin when $K_r$ reduces to a threshold value labeled $K_{r2}$ .

For three-stage drying, $K_r$ is calculated for the second stage as

$$K_r = K_{r2} + (1 - K_{r2}) \frac{TEW_2 - D_{e,j-1}}{TEW_2 - REW} \quad \text{for } REW < D_{e,j-1} < TEW_2 \quad (30)$$

where $TEW_2$ = maximum cumulative depth of evaporation (depletion) from the soil surface layer when $K_r = K_{r2}$ (point at which evaporation transitions into stage three drying) (mm), and $K_{r2}$ = value for $K_r$ at the junction of Stage 2 and Stage 3 drying. Generally, the value for $K_{r2}$ should be some relatively low value between about 0.1 and 0.4, depending on the nature and degree of cracking as the soil dries. Allen et al. (1998) recommended $K_{r2} \sim 0.2$ . Mutziger et al. (2001) found best fit values for $K_{r2}$ for two cracking soils in Texas to be 0.3 and 0.2 when comparing against lysimeter measurements of evaporation for a black clay and clay loam.

![Fig. 6. Field measurements of volumetric water content for cracking soils in Imperial Irrigation District when wet (square symbols) and after 45 and 120 days of drying (circles and triangles). The graph shows Volumetric Water Content, % on the y-axis (0 to 60) and Depth in Soil, m on the x-axis (0 to 0.7). Data points are shown for Bedded Onions - 45 d dry (circles), Disked Wheat - 120 d dry (triangles), and Disked Wheat - 2 hr after irrig. (squares). A line represents the 'Upper Limit of Water Content for Surface Irrigation on Tilled Soil'. A horizontal line at ~40% is labeled 'maximum 75 mm in Stage 3'. A line labeled 'Lower Limit of Evaporation - stage 3 drying - NonTilled (noncracked) Soil' is shown. A line labeled 'Evaporation Depth for Surface Irrigation on NonTilled, Cracking Soil - stage 2 drying' is also shown.](0f3e3ea50bcceb86f6c524ab2b6f3e7a_img.jpg)

Fig. 6. Field measurements of volumetric water content for cracking soils in Imperial Irrigation District when wet (square symbols) and after 45 and 120 days of drying (circles and triangles). The graph shows Volumetric Water Content, % on the y-axis (0 to 60) and Depth in Soil, m on the x-axis (0 to 0.7). Data points are shown for Bedded Onions - 45 d dry (circles), Disked Wheat - 120 d dry (triangles), and Disked Wheat - 2 hr after irrig. (squares). A line represents the 'Upper Limit of Water Content for Surface Irrigation on Tilled Soil'. A horizontal line at ~40% is labeled 'maximum 75 mm in Stage 3'. A line labeled 'Lower Limit of Evaporation - stage 3 drying - NonTilled (noncracked) Soil' is shown. A line labeled 'Evaporation Depth for Surface Irrigation on NonTilled, Cracking Soil - stage 2 drying' is also shown.

**Fig. 6.** Field measurements of volumetric water content for cracking soils in Imperial Irrigation District when wet (square symbols) and after 45 and 120 days of drying (circles and triangles). Superimposed on data are abstracted water content profiles associated with Stages 1 and 2 and with Stage 3 evaporation components

![Fig. 7. Simulated K_{cb} (heavy line) and K_{cb} + K_r (light line) curves for crop of field corn planted in late January in southern California on cracking soil. The graph shows K_c on the y-axis (0.0 to 1.4) and Day of the Year on the x-axis (0 to 360). The heavy line is K_{cb} and the light line is K_{cb} + K_r. The graph is labeled 'Field Corn Southern California --- Cracking Soil'. It shows 'Planting' at day 30, 'Harvest' at day 180, and 'Pre-Tillage Irrigation' at day 330. 'Slow drydown to K_{cb} = 0' is indicated after day 330. Vertical bars represent predicted timing and depths of irrigation, and diamonds represent rainfall.](0d5fdb87a392819c7d2e3b6230912a0b_img.jpg)

Fig. 7. Simulated K\_{cb} (heavy line) and K\_{cb} + K_r (light line) curves for crop of field corn planted in late January in southern California on cracking soil. The graph shows K_c on the y-axis (0.0 to 1.4) and Day of the Year on the x-axis (0 to 360). The heavy line is K\_{cb} and the light line is K\_{cb} + K_r. The graph is labeled 'Field Corn Southern California --- Cracking Soil'. It shows 'Planting' at day 30, 'Harvest' at day 180, and 'Pre-Tillage Irrigation' at day 330. 'Slow drydown to K\_{cb} = 0' is indicated after day 330. Vertical bars represent predicted timing and depths of irrigation, and diamonds represent rainfall.

**Fig. 7.** Simulated $K_{cb}$ (heavy line) and $K_{cb} + K_r$ (light line) curves for crop of field corn planted in late January in southern California on cracking soil having $REW=8$ mm, $TEW_2=50$ mm, $TEW_3=100$ mm, $K_{r2}=0.2$ , and $f_w=0.7$ for growing period irrigations and $f_w=1.0$ for preirrigations. Bars denote predicted timing and depths of irrigation and diamonds denote rainfall

$K_r$ is calculated for the third stage as

$$K_r = K_{r2} \frac{TEW_3 - D_{e,j-1}}{TEW_3 - TEW_2} \quad \text{for } TEW_2 \leq D_{e,j-1} \quad (31)$$

where $TEW_3$ = maximum cumulative depth of evaporation (depletion) from the soil surface layer when the soil is dry and no further evaporation occurs ( $K_r=0$ ) (mm). The value $TEW_3$ includes $REW$ and $TEW_2$ . For application of the three-stage drying extension with the first extension, Eqs. (22) and (23) are expanded using Eqs. (30) and (31), with each application $(1+P)$ and $(P)$ having its own water balance.

The three stage drying extension has been applied to cracking heavy clay soils in the Imperial Irrigation District of California (Allen et al. 2005) and to two cracking or partially cracking soils in Texas (Mutziger et al. 2001). Values used for the Imperial soils were $REW=8$ mm, $TEW_2=50$ mm, $TEW_3=100$ mm, and $K_{r2}$

![Fig. 8. Daily crop coefficients based on measured evapotranspiration and simulated using FAO-56 dual K_c approach at Kimberly, Id. for a crop of sweet corn. The graph shows K_c on the y-axis (0.0 to 1.6) and Day of the Year on the x-axis (130 to 250). The graph is labeled 'Sweet Corn Kimberly, Idaho, 1976'. It shows 'Evap. = 24%'. The graph shows measured evapotranspiration (diamonds) and simulated K_c (heavy line). Vertical bars represent predicted timing and depths of irrigation, and diamonds represent rainfall.](f09dce76b09a6f332810e5193cc39d56_img.jpg)

Fig. 8. Daily crop coefficients based on measured evapotranspiration and simulated using FAO-56 dual K_c approach at Kimberly, Id. for a crop of sweet corn. The graph shows K_c on the y-axis (0.0 to 1.6) and Day of the Year on the x-axis (130 to 250). The graph is labeled 'Sweet Corn Kimberly, Idaho, 1976'. It shows 'Evap. = 24%'. The graph shows measured evapotranspiration (diamonds) and simulated K_c (heavy line). Vertical bars represent predicted timing and depths of irrigation, and diamonds represent rainfall.

**Fig. 8.** Daily crop coefficients based on measured evapotranspiration and simulated using FAO-56 dual $K_c$ approach at Kimberly, Id. for a crop of sweet corn (lysimeter data from Wright 1982, personal communication 1990).

![Figure 9: Sensitivity of daily Kc act estimation for snap bean crop near Kimberly, Id. The figure consists of five subplots (a-e) showing Kc vs. Day of the Year (135-235). Each plot includes precipitation (P) and irrigation (I) events. (a) Ks = 1 (baseline) and Ks = f(theta). (b) Z0 = 0.2 m, Z0 = 0.15 m, Z0 = 0.1 m. (c) fw = 0.65, fw = 0.45, fw = 0.25. (d) Te = 0.2, Te = 0.1, Te from Eq. (11). (e) without Te, with Te.](adb1f42239329fa8283d1a40005f989f_img.jpg)

Figure 9: Sensitivity of daily Kc act estimation for snap bean crop near Kimberly, Id. The figure consists of five subplots (a-e) showing Kc vs. Day of the Year (135-235). Each plot includes precipitation (P) and irrigation (I) events. (a) Ks = 1 (baseline) and Ks = f(theta). (b) Z0 = 0.2 m, Z0 = 0.15 m, Z0 = 0.1 m. (c) fw = 0.65, fw = 0.45, fw = 0.25. (d) Te = 0.2, Te = 0.1, Te from Eq. (11). (e) without Te, with Te.

**Fig. 9.** Sensitivity of daily $K_{c,act}$ estimation for snap bean crop near Kimberly, Id. (lysimeter data from J. L. Wright, unpublished) to: (a) application of water stress function [Eq. (32)] (thin line) with comparison to $K_c$ predicted using $K_s=1$ (medium line), $K_{cb}$ (thick line), and measured $K_c$ (symbols); (b) value for $z_0$ ; (c) application of $T_e$ in Eq. (12); (d) value for $T_e$ ; and (e) value for $f_c$

$=0.2$ . Best fit values (to lysimeter evaporation measurements) for the Houston black clay and Pullman clay loam soils evaluated by Mutziger were $REW=7$ mm; $TEW_2=30$ and $22$ mm; and $TEW_3=50$ and $45$ mm.

$TEW_2$ and $TEW_3$ for the Imperial Valley soils were estimated from sampled soil water contents at the beginning and end of drying cycles in fallow fields as shown in Fig. 6. The sampling sites were in an area of mixed Imperial silty clay and Imperial-Glenbar silty clay loam soil. Cracks penetrated to about $1$ m on drying on an approximately $0.5$ to $2$ m grid and average crack

width was $10$ mm. Moisture was gravimetrically determined from cored samples. In the case of sampling the dry profile where the soil was deeply cracked, samples were taken approximately $0.3$ m in from the face of cracks. The areas between the upper horizontal and the lower horizontal or diagonal lines in the figure suggest the equivalent depth of water evaporated during Stages 1 and 2 and during Stage 3 from the cracking soil. The sampling indicated drying to a depth of more than $0.5$ m due to cracking. Even though the apparent depletable depth from $0.12$ to $0.6$ m shown in Fig. 6 was about $75$ mm, a value of $50$ mm for Stage 3 drying

![Figure 10: A scatter plot showing Predicted ET (mm/day) on the y-axis versus Lysimeter (mm/day) on the x-axis. The data points are for Sweet Corn in Kimberly, Idaho, 1976, using the FAO-56 procedure. A solid diagonal line represents the 1:1 ratio. Text inside the plot area indicates SEE=0.92 mm/d and Ratio = 1.02. The axes range from 0 to 12 mm/day.](d48475a25698b1c0592e4cfe07138f2a_img.jpg)

Figure 10: A scatter plot showing Predicted ET (mm/day) on the y-axis versus Lysimeter (mm/day) on the x-axis. The data points are for Sweet Corn in Kimberly, Idaho, 1976, using the FAO-56 procedure. A solid diagonal line represents the 1:1 ratio. Text inside the plot area indicates SEE=0.92 mm/d and Ratio = 1.02. The axes range from 0 to 12 mm/day.

Fig. 10. Daily measured and estimated evapotranspiration for sweet corn near Kimberly, Id. using _FAO-56_ dual $K_c$ procedure (data from Wright 1982, personal communication 1990).

(so that $TEW_3=50+50=100$ mm) was selected for routine application in the Imperial Valley to account for dampening effects of disking and other tillage on creating a surface soil mulch and any effects of water extraction by roots (Allen et al. 2005).

The net impact of Stage 3 drying is to prolong the time for $K_r$ to decrease to zero, thereby creating a prolonged “base-line” evaporation rate. As shown in Fig. 7, where the _FAO-56_ $K_{cb}+K_e$ method was applied with Stage 3 drying, base-line evaporation was prolonged following harvest for more than 60 days, even when time between wetting events was large. Without the Stage 3 drying, $K_{e,act}$ reduced to zero within 5–10 days following harvest. The $K_{cb}$ prior to planting and following harvest was set to zero to allow evaporation (and total ET) to approach zero during extended dry periods.

### Impacts of Water Stress

The final component in Eq. (4) is the water stress coefficient $K_s$ used to reduce $K_{cb}$ under conditions of water stress or salinity stress. Allen et al. (1998) describes the salinity stress function and computation. The water stress function is described here and is illustrated later. Mean water content of the root zone in the _FAO-56_ procedure is expressed by root zone depletion, $D_r$ , i.e., water shortage relative to field capacity. At field capacity, $D_r=0$ . Stress is presumed to initiate when $D_r$ exceeds RAW, the depth of readily available water in the root zone. For $D_r > \text{RAW}$ , $K_s$ is

$$K_s = \frac{\text{TAW} - D_r}{\text{TAW} - \text{RAW}} = \frac{\text{TAW} - D_r}{(1-p)\text{TAW}} \quad (32)$$

where TAW=total available soil water in the root zone (mm), and $p$ =fraction of TAW that a crop can extract from the root zone without suffering water stress. When $D_r \leq \text{RAW}$ , $K_s=1$ . The total

available water in the root zone is estimated as the difference between the water content at field capacity and wilting point

$$\text{TAW} = 1000(\theta_{FC} - \theta_{WP})Z_r \quad (33)$$

where $Z_r$ =effective rooting depth (m) and $Z_r$ contains $Z_e$ . RAW is estimated as

$$\text{RAW} = p\text{TAW} \quad (34)$$

where RAW has units of TAW (mm). _FAO-56_ contains recommended values for $p$ for 60 crops and describes several means to model the development (increase) in $Z_r$ with time for annual crops including in proportion to development of $K_{cb}$ and in proportion to time. Other methods for $Z_r$ development include a sine function of time (Borg and Grimes 1986), an exponential function of time dampened by soil temperature and soil moisture (Danuso et al. 1995), and a full root growth simulation model by Jones et al. (1991).

## Example Applications and Sensitivity Analyses

Illustrative applications of the _FAO-56_ procedure are given in Fig. 8 for a sweet corn crop and in Fig. 9 for a snap bean crop grown near Kimberly, Id. during 1976 and 1974 by Wright (1982). Daily ET was measured using a precision weighing lysimeter planted to and immediately surrounded by a specific crop. Fetch of the lysimeter was at least 50 m in all directions for the specific crop and resolution of the lysimeter system was about 0.05 mm (Wright 1982). The daily measured $K_c$ values in the figures were calculated by dividing daily lysimeter measurements by $ET_0$ as computed by Eq. (1). Weather data were assembled from a grassed weather station located about 1 km north of the lysimeter site. Dates for planting and harvest and for precipitation and irrigation were based on field notes (Wright, personal communication 1990; Vanderkimpfen 1991). Values for $K_{cb}$ were taken from _FAO-56_. Dates for beginning of development, midseason and late season periods for the _FAO-56_ procedure were selected to fit the lysimeter data.

The application used the original _FAO-56_ procedure with extension for $T_e$ . The Portneuf silt loam soil at Kimberly was modeled using two-stage drying with $Z_e$ set to 0.15 m and $\text{REW}=8$ mm and $\text{TEW}=34$ mm. The value for $f_w$ was 0.6 for the furrow-irrigated sweet corn and 0.45 for alternate furrow-irrigated beans.

For the application to beans, ranges in values for parameters $K_s$ , $f_w$ , $T_e$ , $Z_e$ , and $f_c$ were applied to illustrate the sensitivity of the _FAO-56_ model predictions to these parameters. In the case of $K_s$ and $T_e$ , the sensitivity was with and without the inclusion of functions for these parameters.

## Results

Simulated daily $K_{cb}$ and $K_{e,act}$ and measured $K_{e,act}$ for the growing period for the sweet corn crop shown in Fig. 8 indicate relatively

**Table 3.** Standard Error of Estimate (SEE) and Ratio of Estimated to Measured Daily Evapotranspiration for Full Season of Snap Beans in 1974 near Kimberly, Id. ( $n=98$ days), where Baseline Conditions were $f_w=0.45$ , $T_e=0$ , $K_s=1$ , $Z_e=0.15$ m, and $f_c$ from Eq. (11)

|                             | Baseline | $f_w=0.25$ | $f_w=0.65$ | with $T_e$ | with $K_s$ | $Z_e=0.10$ m | $Z_e=0.20$ m | $f_c=0.2$ | $f_c=0.2$ |
| --------------------------- | -------- | ---------- | ---------- | ---------- | ---------- | ------------ | ------------ | --------- | --------- |
| SEE (mm day <sup>-1</sup> ) | 0.63     | 0.74       | 0.68       | 0.67       | 0.78       | 0.76         | 0.61         | 0.66      | 0.68      |
| Ratio to measured           | 1.00     | 0.96       | 1.03       | 0.98       | 0.96       | 0.96         | 1.04         | 1.03      | 0.95      |

good agreement between simulated and measured values. The peak spikes in $K_{c, \text{act}}$ following wetting agreed well with measurements as did the rate of decay of the $K_e$ curve. There was some underestimation of $K_{c, \text{act}}$ during the midseason period which may have been caused by underestimation of $ET_0$ by Eq. (1) or underestimation of the midseason $K_{cb}$ for corn by _FAO-56_. The $K_{c, \text{act}}$ predicted during the late season overestimated measured $K_{c, \text{act}}$ for some days and underestimated over two 5 day periods. Much of the under- and overestimation during the senescence period was probably caused by uncertainty in the estimation of $f_e$ during that period and the impact of ground shading on the wetted portion of the soil surface.

The unadjusted standard error of estimate (SEE) between the estimated and lysimeter-measured daily ET (Fig. 10) was 0.92 mm day<sup>-1</sup> and the seasonal ratio of predicted ET to measured ET was 1.02. Total seasonal evaporation for the sweet corn crop was estimated to be 24% of the total seasonal ET. Because the lysimeter measurements provide only integrated values of ET, the separate estimation of evaporation cannot be evaluated for accuracy. Estimates of soil evaporation do not include the evaporation from soil that occurs as a diffusive component of $K_{cb}$ over time.

Sensitivity of the $K_{cb}+K_e$ procedure of _FAO-56_ to invocation of a $K_s$ soil moisture stress function under conditions where mild stress may have occurred is shown in Fig. 9(a) for the 1974 snap bean crop. Without the $K_s$ function (thus $K_s=1.0$ ), the $K_{c, \text{act}}$ curve (medium gray line) "bottomed" against the $K_{cb}$ curve (heavy line). With the $K_s$ function [Eq. (32)], drying below the $p$ level of the root zone was predicted during the development period, late midseason, and latter part of the late season. These predictions were based on actual irrigation dates and values for soil water holding properties from Table 1 ( $AW=160 \text{ mm m}^{-1}$ ), and $p=70\%$ during the initial period and $p=55\%$ for the other three periods, and maximum rooting depth of 1.6 m, based on measurements by Wright (unpublished data, 2000). The application of the $K_s$ function improved estimation of $K_{c, \text{act}}$ for some dates and caused underestimation for others. No visual or measured stress by the lysimeter crop in 1974 was noted by Wright (1982).

Figure 9(b) illustrates the impact that $f_w$ , the fraction of soil surface wetted by irrigation, has on the $K_{c, \text{act}}$ estimate. Higher values for $f_w$ extended the magnitudes and time lengths of drydown for $K_e$ "spikes" during the development period when the value $1-f_e$ in Eq. (10) was large. During midseason period, $1-f_e$ in Eq. (10) limited the value for $f_{ew}$ regardless of range in $f_w$ . Thus, sensitivity to $f_w$ is generally prominent only during the initial and development periods.

The inclusion of the $T_e$ function for extraction for transpiration from the $Z_e$ layer impacted the estimation for $K_e$ during the initial and development periods and had no impact during the mid and late season periods when the evaporation layer was largely shaded. The $T_e$ function reduced the prediction of $K_e$ for the precipitation event on Day 156 [Fig. 9(b)] because $T_e$ extraction during prior days increased $D_e$ so that the 6 mm precipitation depth was absorbed into the Stage 2 depletion reservoir, rather than adding to Stage 1 drying. This illustrates a weakness of the _FAO-56_ model in that any light precipitation event is subtracted from the total $D_e$ for the $Z_e$ depth, rather than left on the soil skin for immediate evaporation. $D_e$ was increased during the initial period with the application of the $T_e$ function because all of the $K_{cb}$ value [0.15 in Fig. 9(b)] is assigned to basal transpiration in the dual procedure, even though the 0.15 value may contain significant amounts of diffusive evaporation. There is danger in assigning too large a value for $K_{cb}$ in the dual method, including the method of Wright (1982), since no limit is placed on $K_{cb}$ extrac-

tion from a shallow, initial root depth unless the $K_s$ function is invoked. The fact that inclusion of the $T_e$ function did not improve predictions for the snap beans may reflect the tillage practices for beans, where open spaces between rows are cultivated two to three times during the growing season, thus reducing root activity there and thus extraction by transpiration. The $1-f_e$ parameter in Eq. (10) represents these open spaces.

The impact of the value assigned to $Z_e$ , the effective depth of the evaporating layer, is illustrated in Fig. 9(d). With all other parameters fixed, the impact of greater $Z_e$ is to extend the lengths of drydown periods and to increase the estimated evaporation component of ET. The impact of $Z_e$ was pronounced during all periods.

Sensitivity to the estimation of fraction of surface covered by vegetation is illustrated in Fig. 9(e), where 0.2 was added and subtracted from the value for $f_e$ predicted by Eq. (11). The impact of value for $f_e$ was negligible for the initial and most of the development period when $1-f_e$ exceeded the value assigned to $f_w$ . In this case, $f_w$ controlled the estimate of evaporation. As $f_e$ increased, its value began to control $f_{ew}$ from Eq. (10) and impact on $K_e$ and $K_{c, \text{act}}$ increased. The smaller value for $f_e$ (i.e., $f_e=0.2$ ) during late development and mid season tended to improve estimates during those periods.

Table 3 lists summary statistics for the five sensitivity tests. The smallest SEE (0.61 mm day<sup>-1</sup>) occurred when $Z_e$ was increased from 0.15 to 0.20 m, however, the reduction in SEE over the baseline was very small. The impact by the individual ranges in the parameters on the ratio of estimated seasonal ET to measured ET ranged from -5 to +4%.

## Summary and Conclusions

The _FAO-56_ dual $K_e$ procedure was established to provide daily estimates of evaporation from wet soil in conjunction with crop transpiration. The procedure uses a daily water balance of the soil surface layer and accounts for the fraction of soil surface wetted by irrigation or by precipitation and exposed to radiation and ventilation. Three optional extensions to the original method are described. The first is the establishment of a separate water balance for the fraction of the surface wetted by precipitation, only, and for the fraction wetted by both irrigation and precipitation. The second extension is a procedure to approximate the drying of the surface layer by transpiration in addition to evaporation. The third extension provides for the application to deep cracking soils. The dual $K_e$ procedure is useful when short term estimates of evapotranspiration are needed, for example in research and in irrigation scheduling for individual fields as well as in estimation of total consumption of water where impacts of wetting frequency are important.

The sensitivity analysis indicates that inclusion of a function to estimate transpiration from the evaporating layer may not substantially impact or improve estimates, especially for crops having periodic cultivation. Calculations are moderately sensitive to values specified for the depth of the evaporation layer and fraction of surface wetted by irrigation, and to the estimation of fraction of ground cover.

## References

- Allen, R. G., Clemmens, A. J., Burt, C. M., Solomon, K., and O'Halloran, T. (2005). "Prediction accuracy for project-wide evapo-

- transpiration using crop coefficients and reference evapotranspiration." _J. Irrig. Drain. Eng._, 13(1), XXX-XXX.
- Allen, R. G., Pereira, L. S., Raes, D., and Smith, M. (1998). "Crop evapotranspiration: Guidelines for computing crop requirements." _Irrigation and Drainage Paper No. 56_, FAO, Rome, Italy.
- Allen, R. G., Pruitt, W. O., Businger, J. A., Fritschen, L. J., Jensen, M. E., and Quinn, F. H. (1996). "Evaporation and Transpiration." _ASCE handbook of hydrology_, Wootton et al., eds., Chap. 4, New York, 125-252.
- Allen, R. G., Smith, M., Pereira, L. S., and Perrier, A. (1994). "An update for the calculation of reference evapotranspiration." _ICID Bull._, 43(2), 35-92.
- American Society of Civil Engineers (ASCE). (2002). _The ASCE standardized equation for calculating reference evapotranspiration_, Task Committee Report, Environment and Water Resources Institute of ASCE, New York.
- Bonachela, S., Orgaz, F. O., Villalobos, F. J., and Fereres, E. (2001). "Soil evaporation from drip-irrigated olive orchards." _Irrig. Sci._, 20, 65-71.
- Borg, H., and Grimes, D. W. (1986). "Depth development of roots with time: An empirical description." _Trans. ASAE_, 29(1), 194-197.
- Chanzy, A., and Bruckler, L. (1993). "Significance of soil surface moisture with respect to daily bare soil evaporation." _Water Resour. Res._, 29, 1113-1125.
- Danuso, F., Gani, M., and Giovanardi, R. (1995). "Field water balance: BldriCo 2." _Crop-water-simulation models in practice_, L. S. Pereira, B. J. van den Broek, P. Kabat, and R. G. Allen, eds., Wageningen Press, Wageningen, The Netherlands, 49-73.
- Doorenbos, J., and Pruitt, W. O. (1977). "Crop water requirements." _Irrigation and Drainage Paper No. 24_, (rev.) FAO, Rome.
- Food and Agriculture Organization (FAO). 1998. "Crop evapotranspiration: Guidelines for computing crop requirements." <http://www.fao.org/docrep/X0490E/X0490E00.htm>, accessed November 10, 2004.
- Hawkins, R. H., Hjelmfelt, A. T., and Zevenbergen, A. W. (1985). Runoff probability, storm depth, and curve numbers. _J. Irrig. Drain. Eng._, 111(4), 330-340.
- Jensen, M. E., Wright, J. L., and Pratt, B. J. (1971). "Estimating soil moisture depletion from climate, crop and soil data." _Trans. ASAE_, 14(6), 954-959.
- Jones, C. A., Bland, W. L., Ritchie, J. T., and Williams, J. R. (1991). "Simulation of root growth." _Modeling plant and soil systems_, J. Hands and J. T. Ritchie, eds., ASA, Madison, Wis., 91-123.
- Mutziger, A. J., Burt, C. M., Howes, D. J., and Allen, R. G. (2001). "Comparison of measured and FAO-56 modeled evaporation. Appendix E in Evaporation from irrigated agricultural land in California." _IITR Report Nos. R 02-001, R 02-001_, Calpoly, San Luis Obispo, Calif., (<http://www.itrc.org/reports/EvaporationCA/EvaporationCA.html>, accessed September 20, 2003).
- Mutziger, A. J., Burt, C. M., Howes, D. J., and Allen, R. G. (2005). "Comparison of measured and FAO-56 modeled evaporation from bare soil." _J. Irrig. Drain. Eng._, 131(1), XXX-XXX.
- Pereira, L. S., and Allen, R. G. (1999). "Crop Water Requirements." _CIGR (International Association of Agricultural Engineers) handbook of agricultural engineering_, Vol. 1, Sec. 1.5.1, ASAE, St. Joseph, Mich., 213-262.
- Pereira, L. S., Smith, M., and Allen, R. G. (1998). "Méthode pratique de calcul des besoins en eau." _Traité d'irrigation_, J. R. Tiercelin, ed., Lavoisier, Technique & Documentation, Paris, 206-231.
- Petty, D. E., and Switzer, R. E. (1996). "Sharkey soils in Mississippi." _Mississippi Agricultural and Forestry Experiment Station Bulletin 1057_ (<http://msucares.com/pubs/bulletins/b1057.htm>, accessed October 17, 2003).
- Philip, J. R. (1957). "Evaporation and moisture and heat fields in the soil." _J. Meteorol._, 14, 354-366.
- Pruitt, W. O., Fereres, E., Henderson, D. W., and Hagan, R. M. (1984). "Evapotranspiration losses of tomatoes under drip and furrow irrigation." _Calif. Agric._, Univ. California at Berkeley, Berkeley, Calif., May-June, 10-11.
- Ritchie, J. T. (1972). "Model for predicting evaporation from a crop with incomplete cover." _Water Resour. Res._, 8, 1204-1213.
- Ritchie, J. T., Godwin, D. C., and Singh, U. (1989). "Soil and weather inputs for the IBSNAT crop models." _Proc., IBSNAT Symp.: Decision Support System for Agrotechnology Transfer: Part I_, IBSNAT, Dept. of Agronomy and Soil Science, College of Tropical Agriculture and Human Resources, University of Hawaii, Honolulu, 31-45.
- Saxton, K. E., Johnson, H. P., and Shaw, R. H. (1974). "Modeling evapotranspiration and soil moisture." _Trans. ASAE_, 17(4), 673-677.
- Smith, M., Allen, R. G., Monteith, J. L., Pereira, L. S., Perrier, A., and Pruitt, W. O. (1991). Rep. on the Expert Consultation on Revision of FAO Guidelines for Crop Water Requirements, Land and Water Dev. Division, FAO, Rome, (<http://www.fao.org/WAICENT/FaoInfo/Agricult/aglw/webpub/REV PUB.htm>, accessed July 4, 2003.)
- Snyder, R. L., Bali, K., Ventura, F., and Gomez-MacPherson, H. (2000). "Estimating evaporation from bare or nearly bare soil." _J. Irrig. Drain. Eng._, 126(6), 399-403.
- Vanderkemp, P. J. (1991). "Estimation of crop evapotranspiration by means of the Penman-Monteith equation." PhD dissertation, Dept. of Biology and Irrigation Engineering, Utah State Univ., Logan, Utah.
- Wright, J. L. (1981). "Crop coefficients for estimates of daily crop evapotranspiration." _Irrigation scheduling for water and energy conservation in the 80's_, ASAE, St. Joseph, Mich., 18-26.
- Wright, J. L. (1982). "New evapotranspiration crop coefficients." _J. Irrig. Drain. Div._, 108(1), 57-74.
- Wright, J. L., and Jensen, M. E. (1978). "Development and evaluation of evapotranspiration models for irrigation scheduling." _Trans. ASAE_, 21(1), 88-91,96.
