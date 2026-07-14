![AquaCrop logo: a stylized plant growing from a hexagonal base.](935eed7aa61f7777f62cfc032e11bee9_img.jpg)

AquaCrop logo: a stylized plant growing from a hexagonal base.

# AquaCrop—The FAO Crop Model to Simulate Yield Response to Water: II. Main Algorithms and Software Description

Dirk Raes,\* Pasquale Steduto, Theodore C. Hsiao, and Elias Fereres

## ABSTRACT

The AquaCrop model was developed to replace the former FAO I&D Paper 33 procedures for the estimation of crop productivity in relation to water supply and agronomic management in a framework based on current plant physiological and soil water budgeting concepts. This paper presents the software of AquaCrop for which the concepts and underlying principles are described in the companion paper (Steduto et al., 2009). Input consists of weather data, crop characteristics, and soil and management characteristics that define the environment in which the crop will develop. Algorithms and calculation procedures modeling the infiltration of water, the drainage out of the root zone, the canopy and root zone development, the evaporation and transpiration rate, the biomass production, and the yield formation are presented. The mechanisms of crop response to cope with water shortage are described by only a few parameters, making the underlying processes more transparent to the user. AquaCrop is a menu-driven program with a well-developed user interface. With the help of graphs which are updated each time step (1 d) during the simulation run, the user can track changes in soil water content, and the corresponding changes in crop development, soil evaporation and transpiration rate, biomass production, and yield development. One can halt the simulation at each time step, to study the effect of changes in water related inputs, making the model particularly suitable for developing deficit irrigation strategies and scenario analysis.

**A**GRICULTURE is the world's largest water user in terms of volume. In the years to come, it is expected that the agricultural sector will be unable to compete with municipalities and industry for scarce water, and yet is under pressure to produce more food and fiber to satisfy the growing world population. In the context of water scarcity, the software AquaCrop has been developed by FAO to help project managers, consultants, irrigation engineers, agronomists, and even farm managers with the formulation of guidelines to increase the crop water productivity for both rainfed and irrigated production systems. By linking a robust soil water model to the newly developed crop water productivity model, the expected crop development and production for specific climate and growing conditions can be estimated with AquaCrop. Examples of this are given in several accompanying AquaCrop papers in this issue (Farahani et al., 2009; García-Vila et al., 2009; Geerts et al., 2009; Heng et al., 2009; Hsiao et al., 2009). Further improvements of

AquaCrop are planned, including soil salinity and capillary rise of water from a shallow water table.

Steduto et al. (2009) presents in the companion paper the concepts, rationale, approaches, and procedures selected or synthesized to simulate the processes in AquaCrop. This paper presents the main algorithms used in the model software and describes model operation. A distinction is made between the input requirements and basic elements of the model, the calculation procedures with the corresponding equations, and the outputs of the model. Further details of the subroutines of AquaCrop are fully described in its Reference Manual (Raes et al., 2008). Figures in this paper illustrate the user interface which makes AquaCrop unusually helpful for entering data and analyzing simulation results.

## AQUACROP MODEL

The crop grows by developing a green canopy that transpires water, and a root system that deepens and takes up water. The transpired water is in exchange for biomass produced (via the assimilation of carbon dioxide, not directly simulated). At a certain phenological stage, a part of the biomass is partitioned to the yield component as determined by the harvest index (HI).

The calculation scheme of AquaCrop is depicted in Fig. 1. Throughout the crop cycle the amount of water stored in the root zone is simulated by budgeting the incoming (rainfall and irrigation) and outgoing (runoff ET and deep percolation) water fluxes at its boundaries. The root zone depletion determines the magnitude of the water stress coefficients (Ks)

D. Raes, K.U. Leuven Univ., Dep. of Earth and Environmental Sci., Celestijnenlaan 200E- Postbox 02411, B-3001, Leuven, Belgium; P. Steduto, Water Resources, Development and Management Service, Land and Water Division, FAO, Room B-721, Via delle Terme di Caracalla 00100, Rome, Italy; T.C. Hsiao, Univ. of California, Dep. of Land, Air and Water Resources, One Shields Avenue, Vohlmeyer Hall, Davis, CA 95616; E. Fereres, IAS-CSIC and Univ. of Cordoba, Apartado 4084, 14080-Cordoba, Spain. Received 30 Apr. 2008. \*Corresponding author (dirk.raes@ees.kuleuven.be).

Published in Agron. J. 101:438–447 (2009).

doi:10.2134/agronj2008.0140s

Copyright © 2009 by the American Society of Agronomy, 677 South Segoe Road, Madison, WI 53711. All rights reserved. No part of this periodical may be reproduced or transmitted in any form or by any means, electronic or mechanical, including photocopying, recording, or any information storage and retrieval system, without permission in writing from the publisher.

![AJ Agronomy Journal logo: a stylized 'AJ' with 'AGRONOMY JOURNAL' and 'SINCE 1908' below it.](403aadfa553f530f227ac5d59f5a2e66_img.jpg)

AJ Agronomy Journal logo: a stylized 'AJ' with 'AGRONOMY JOURNAL' and 'SINCE 1908' below it.

**Abbreviations:** FC, field capacity; CC, green canopy cover; CDC, canopy decline coefficient; CGC, canopy growth coefficient; GDD, growing degree days; HI, harvest index; Ks, water stress coefficients; PWP, permanent wilting point; REW, readily evaporable water; TAW, total available soil water (between field capacity and permanent wilting point) in the root zone; WP\*, normalized water productivity.

affecting (i) green canopy cover (CC) expansion, (ii) stomatal conductance and hence transpiration per unit CC, (iii) canopy senescence and decline, and (iv) the HI. Each of these effects has its own threshold depletions and response curves. Additionally, (v) the root system deepening rate is a function of Ks for stomatal conductance. If water stress occurs, the simulated CC will be less than the potential canopy cover ( $CC_{pot}$ ) for no stress conditions. The coefficient for transpiration ( $Kc_{tr}$ ) is proportional to CC, and hence continuously adjusted throughout the simulation. Aboveground biomass (B) is derived from transpiration by means of the normalized water productivity ( $WP^*$ ), a conservative parameter. At the end of the crop cycle, yield is calculated as the product of the simulated B and the adjusted (HI).

## MODEL ELEMENTS AND INPUT

Although grounded on basic and complex biophysical processes (Steduto et al., 2009), AquaCrop uses a relatively small number of explicit parameters and largely-intuitive input variables, either widely used or requiring simple methods for their determination. The inputs are stored in climate, crop, soil and management files and can be easily changed through the user-interface. Multiple graphs and schematic displays in the Menus help the user to discern the consequences of input changes.

### Climatic Data

For each day of the simulation period, AquaCrop requires minimum and maximum air temperature, reference evapotranspiration ( $ET_o$ ) as a measure of evaporative demand of the atmosphere, and rainfall. Temperature data are used to calculate growing degree day (GDD), which determines crop development and phenology, and also for making adjustments in biomass production during damaging cold periods. $ET_o$ is derived from weather station data by means of the FAO Penman–Monteith equation (Allen et al., 1998), and an $ET_o$ calculator (FAO, 2009) is available for that purpose. The data can be given in a wide variety of units for processing, and procedures are available in the calculator to estimate missing climatic data.

In the absence of daily weather data, the program uses the interpolation procedure of Gommae (1983) to obtain daily temperature and $ET_o$ from the 10-d or monthly means. For rainfall, with its extremely heterogeneous distribution over time, the use of long-term mean data is not recommended.

Additionally, mean annual atmospheric $CO_2$ concentration measured at Mauna Loa Observatory in Hawaii are provided in AquaCrop for past years, and the user can enter a future year's $CO_2$ for prospective analysis of climate change. High $CO_2$ concentrations will enhance canopy expansion and crop water productivity.

### Soil Data

The soil profile can be composed of up to five different horizons, each with its own physical characteristics. The required soil data are: saturated hydraulic conductivity ( $K_{sat}$ ), volumetric water content at saturation ( $\theta_{sat}$ ), field capacity ( $\theta_{FC}$ ), and permanent wilting point ( $\theta_{PWP}$ ). The user can make use of indicative values provided by AquaCrop for various soil textural classes, or import locally determined or derived data

![Figure 1: Calculation scheme of AquaCrop with indication of processes affected by water stress. The diagram shows a flow from weather data (FAO-Penman Monteith Equation) to transpiration (Ks * Kc_tr * ET_o). Transpiration leads to biomass (WP*), which leads to HI, and finally yield. Water stress (a-e) is indicated by dotted arrows: (a) canopy expansion, (b) stomatal closure, (c) early canopy senescence, (d) Harvest Index adjustment, and (e) root zone expansion. The diagram also shows soil water balance (irrigation, rainfall, runoff, evapotranspiration) and rooting depth over time.](22b2fd4b8672ad8b02cf6cd4de5809cd_img.jpg)

Figure 1: Calculation scheme of AquaCrop with indication of processes affected by water stress. The diagram shows a flow from weather data (FAO-Penman Monteith Equation) to transpiration (Ks \* Kc_tr \* ET_o). Transpiration leads to biomass (WP\*), which leads to HI, and finally yield. Water stress (a-e) is indicated by dotted arrows: (a) canopy expansion, (b) stomatal closure, (c) early canopy senescence, (d) Harvest Index adjustment, and (e) root zone expansion. The diagram also shows soil water balance (irrigation, rainfall, runoff, evapotranspiration) and rooting depth over time.

Fig. 1. Calculation scheme of AquaCrop with indication (dotted arrows) of the processes (a to e) affected by water stress. $CC^*$ is canopy cover adjusted for microadvection, $CC_{pot}$ is potential canopy cover, and $Ks$ is stress coefficient (specific for each target process). HI is harvest index, $Kc_{tr}$ is coefficient for crop transpiration, $WP^*$ is water productivity, normalized for $ET_o$ and air $CO_2$ concentration, $ET_o$ is reference evapotranspiration.

from soil texture with the help of pedo-transfer functions (see e.g., Rawls et al., 1982; Saxton et al., 1986; Soil Conservation Service, 1991).

When specifying soil data for the top horizon, first estimates for the Curve Number (USDA, 1964) and readily evaporable water (REW) (Allen et al., 1998) are automatically derived, as described later.

### Crop Data

The Food and Agriculture Organization is calibrating non-location-specific but crop-specific parameters for major agriculture crops, and provides them as default values in the model (e.g., see Heng et al., 2009; and Hsiao et al., 2009, for maize). These parameters are referred to as conservative, in that they do not change materially with time, management practices, or geographic location. They are calibrated with data of the crop grown under favorable and nonlimiting conditions, but remain applicable for stress conditions via their modulation by stress response functions. In addition, the user needs to provide cultivar-specific parameters which are referred to as user-specific or cultivar-specific. It is recognized that it is not possible to calibrate the model well for all the crop species in the near future. So AquaCrop also provides default or sample values for all required parameters as the starting point to use for unexplored crops in the absence of more specific information (e.g., Geerts et al., 2009). Cognizant of the incomplete nature of information or database, AquaCrop also provides, in many cases, ways to arrive at the desired input data or to approximate them.

### Production Potential

To simulate biomass and yield, the water productivity normalized for $ET_o$ and air $CO_2$ concentration ( $WP^*$ ) and the representative HI reported in the literature for the chosen crop species under nonstress conditions ( $HI_o$ ) are required. The $WP^*$ is a conservative parameter, and $HI_o$ is conservative

![Screenshot of the 'Display/Update crop characteristics' dialog box, specifically the 'Water stresses' folder. The dialog shows various parameters for crop water stress response. Key features include: 'Leaf expansion growth' set to 'moderately tolerant to water stress'; 'Stomatal closure' and 'Early canopy senescence' sections; a 'Correction for ET₀' graph showing 'High ET₀' and 'Low ET₀' curves; a main graph of 'Ks (transpiration)' vs. 'soil water depletion fraction (Drel)' showing a curve from 1.0 to 0.0; and a 'Wetting Point' (PWP) indicated on the x-axis. The x-axis is labeled 'Drel' and ranges from 0.0 to 1.0. The y-axis is labeled 'Ks (transpiration)' and ranges from 0.0 to 1.0. The graph also shows 'Field Capacity' and 'TAW' (Total Available Water) levels. The dialog has buttons for 'Cancel', 'Program settings', 'Main Menu', 'Save as', and 'Help'.](ad04aa6cb9e7fb36bb7a91e817e2d314_img.jpg)

Screenshot of the 'Display/Update crop characteristics' dialog box, specifically the 'Water stresses' folder. The dialog shows various parameters for crop water stress response. Key features include: 'Leaf expansion growth' set to 'moderately tolerant to water stress'; 'Stomatal closure' and 'Early canopy senescence' sections; a 'Correction for ET₀' graph showing 'High ET₀' and 'Low ET₀' curves; a main graph of 'Ks (transpiration)' vs. 'soil water depletion fraction (Drel)' showing a curve from 1.0 to 0.0; and a 'Wetting Point' (PWP) indicated on the x-axis. The x-axis is labeled 'Drel' and ranges from 0.0 to 1.0. The y-axis is labeled 'Ks (transpiration)' and ranges from 0.0 to 1.0. The graph also shows 'Field Capacity' and 'TAW' (Total Available Water) levels. The dialog has buttons for 'Cancel', 'Program settings', 'Main Menu', 'Save as', and 'Help'.

**Fig. 2.** The Water stresses folder of the Crop Menu where information is displayed in the subfolder on water stress affecting canopy expansion, with superimposed drawing defining the relative depletion ( $D_{rel}$ ) of soil water.

to a fair extent but can be cultivar-specific. For use with crop species without calibrated $WP^*$ , general ranges are provided by AquaCrop for C3 and C4 species. If the harvestable organ is rich in oil and/or proteins, $WP^*$ after the beginning of flowering must be reduced over the yield formation period, by multiplying it by an adjustment factor in fractions ( $f_{WP}$ ), entered by the user if not already provided by calibration.

#### Crop Development for No Stress Condition

Instead of LAI, the model uses CC, which is the fraction of soil surface covered by the canopy. Canopy expansion for no stress condition is described by two equations (Steduto et al., 2009) requiring information on (i) plant density, (ii) the soil surface ( $m^2$ ) covered by an individual seedling at 90% emergence, (iii) maximum canopy cover ( $CC_x$ ) for that plant density under optimal conditions, and (iv) canopy growth coefficient (CGC). The last three are conservative parameters. The initial canopy cover at 90% emergence ( $CC_0$ ), required in the equations, is the product of plant density and the size of the canopy cover per seedling. Once senescence starts, CC declines, requiring a canopy decline coefficient (CDC) and the starting time. The CDC ( $d^{-1}$ ) is conservative at least to a certain extent, but senescence starting time depends on phenology and is cultivar-specific. AquaCrop provides alternative procedures to simulate canopy development and decline in case the standard parameters are not available. Plant density can be estimated from sowing rate and approximate germination rate, or from plant spacing.

Other crop parameters to be specified by the user are (i) time of sowing, (ii) maximum rooting depth and the time reached, (iii) the time of start of flowering, and (iv) duration of flowering or the degree of determinacy. The first two are user-specific,

as root development is strongly impacted by local soil conditions. The next two are cultivar-specific. Crop development can be specified in calendar days or GDD. For the purpose of GDD, calculations a base temperature (below which crop development does not progress) and an upper temperature (above which the crop development no longer increases) are required (McMaster and Wilhelm, 1997). These temperatures are conservative for a given species but may be cultivar-specific for lines bred in drastically different environments.

### Crop Transpiration for No Stress Condition

Crop transpiration is calculated as the product of $ET_0$ , the effective (or adjusted) canopy cover, and the coefficient for maximum crop coefficient ( $K_{c_{tr,x}}$ ; for full CC and without stresses). The $K_{c_{tr,x}}$ is conservative and approximately equivalent to the basal crop coefficient at mid-season for different crops found in Allen et al. (1998), but only for cases of full CC.

The root water extraction from the soil profile is governed by the actual soil water content and the maximum amount of water ( $S_x$ ) that can be extracted by the roots per unit of bulk volume of soil, per unit of time ( $m^3 m^{-3} d^{-1}$ ). The $S_x$ at the top of the soil profile is generally different from $S_x$ at the bottom of the root zone (Feddes et al., 1978; Hoogland et al., 1981). By specifying the maximum transpiration rate of a well developed crop (a default value of $15 mm d^{-1}$ for root zones deeper than 0.5 m is considered), and the water extraction pattern throughout the root zone, $S_x$ values are derived in AquaCrop for different depths in the root zone. Since root density is generally highest near the soil surface and declines with depth, a 40/30/20/10% water extraction pattern, respectively, for the upper, second, third, and bottom quarter of the root zone (Soil Conservation Service, 1991), is used by default, but other patterns may be selected as well.

### Stress Response Functions

Effects of water stress on canopy development, stomatal conductance, and early canopy senescence are described by water stress coefficients Ks (Fig. 2). Above an upper threshold of soil water content, water stress is not considered and Ks is 1. Below a lower threshold, the stress is at its full effect and Ks is 0. The thresholds are expressed as a fraction (p) of total available soil water (TAW) (Fig. 2). For leaf and hence canopy growth, the lower threshold is above PWP ( $p < 1$ ); whereas for stomata and senescence, the lower threshold is fixed at PWP ( $p = 1$ ). Between the thresholds, the shape of the Ks curve determines the magnitude of the effect of soil water stress on the process. The shape can be linear or convex, and rarely possibly concave. Tests so far suggest that the thresholds and shapes of these curves may be conservative, at least to a fair degree (Hsiao et al., 2009; Heng et al., 2009).

The shape and degree of curvature of the Ks curves in relation to root zone water depletion are described by the following equation:

$$0 \leq K_s = 1 - \frac{c^{D_{rel} \times f_{shape}} - 1}{c^{f_{shape}} - 1} \leq 1 \quad [1]$$

In Eq. [1] $D_{rel} (\leq 1)$ is relative depletion, the fraction of water depleted relative to the full amount the soil can hold between the upper and lower threshold as defined in p, and $f_{shape}$ is

the shape factor (see Fig. 2). For crops that have not been calibrated, the user can specify in the Menu (Fig. 2) threshold $p$ values and curve shape, or can select a category graded for relative resistance to drought.

As justified in Streduto et al. (2009), the stress response curves are also dependent on transpiration rate, and hence on evaporative demand. In AquaCrop the response curve is for a reference evaporative demand of $ET_o = 5 \text{ mm d}^{-1}$ , and its $p$ is adjusted at run time for different levels of $ET_o$ by:

$$0 \leq P_{adj} = P_{given} + f_{adj} [0.04 \times (5 - ET_o)] \times [\log_{10} (10 - 9 \times P_{given})] \leq 1 \quad [2]$$

where $f_{adj}$ (default value = 1) is a program parameter which can be varied to increase ( $>1$ ) or decrease ( $<1$ ) the adjustment. The log term in Eq. [2] makes the adjustment greater when the soil is wet then when it is dry, based on the likely restriction of stomata and transpiration (and hence less impact of evaporative demand) when the soil is dry. In Fig. 2, the shaded bands on the two sides of the curved line indicate the range of the evaporative demand adjustments as dictated by $ET_o$ .

Water stress may alter HI, either positively or negatively, in several ways, depending on timing, severity, and duration of the stress. One adjustment is for the competition between vegetative and reproductive growth after flowering begins, linked to $K_s$ for leaf growth ( $K_{s_{exp}}$ ) and with positive stress effect on HI. The magnitude of this effect as a function of $K_{s_{exp}}$ is set by a coefficient $a$ , increasing as $a$ diminishes. When stress is severe enough to cause substantial stomata closure and reduction in photosynthesis, the effect on HI is assumed to be negative and linked to $K_s$ for stomata ( $K_{s_{stom}}$ ). The magnitude of this effect is set by coefficient $b$ , with the negative effect on HI being accentuated as $b$ decreases. When stress is very severe and inhibits pollination directly, the effect on HI is negative and its magnitude is set by another $K_s$ coefficient ( $K_{s_{pol}}$ ). The threshold for the failure of pollination, expressed as a fraction ( $p$ ) of TAW, is lower (stronger stress level) than the threshold for the effect for stomatal closure and triggering of senescence. Another adjustment is for possible positive effects of preanthesis stress on HI, specified by the maximum allowed percentage increase. The relevant equations are discussed in a later section.

Water logging and low temperatures can cause stress that affects crop development and growth. Water logging causes lack of aeration in the root zone, and is specified by a $K_s$ coefficient ( $K_{s_{aer}}$ ) for which the threshold is the soil water content below saturation at which poor aeration starts to limit transpiration. AquaCrop considers the impact of low temperature in two ways. One is by using GDD as the clock, accounting for effects on phenology and canopy expansion and decline rate. In addition, it is necessary to account for the more direct effect of cold stress on biomass production. The latter is specified by another $K_s$ coefficient ( $K_{s_c}$ ), which varies between 1 and 0 between an upper threshold and a lower threshold defined in terms of growing degrees per day.

Mineral nutrient stress, particularly the lack of N, can reduce CGC, $CC_x$ , and $WP^*$ . In addition, under long-term nutrient stress, $CC$ normally undergoes steady decline once the adjusted $CC_x$ is reached at mid season. AquaCrop does not simulate nutrient cycles and balance, but provides categories of soil

fertility levels ranging from nonlimiting to severely limiting. The user can chose one of the categories when specifying Field Management, but if needed, calibrates the crop response in the Crop Menu (Fig. 3). The calibration consists in specifying the canopy decline and the reductions in CGC, $CC_x$ , and $WP^*$ for a specific stress level. This determines the shape of various soil fertility stress response curves, used to adjust canopy development and $WP^*$ to other soil fertility levels.

## Field Management

Field management practices are divided into two categories, one more general, and another more specific on irrigation management. Under the general category are choices of soil fertility levels, and practices that affect the soil water balance. One of the latter is mulching to reduce soil evaporation, with the user specifying the degree of soil cover and whether the mulch is plant material or plastic sheeting. The other is if soil bunds are built to store water on the field (as is the case in rice paddy fields), the height of the bunds have to be specified. Additionally, if tillage practices such as soil ridging or contours eliminate run-off of rain water, the user can switch off the run-off procedure.

Under irrigation management, the user chooses whether the crop is rainfed or irrigated. If irrigated, the user can specify each application date and depth, or let the program generate irrigation schedules based on specified time and depth criteria as described by Smith (1985) and used in scheduling software IRIS (Raes et al., 1988) and CROPWAT (Smith, 1990). The time can be a fixed interval, or after an allowable depletion in either amount (mm) or fraction of TAW; the depth can be a fixed depth (mm) or a return to FC. The program allows the use of different irrigation timing and amounts at will, and hence provides the means to test deficit irrigation strategies by applying chosen amounts of water at various stages of crop development. Along with the instant visual display of the simulated effects on canopy size, transpiration, biomass, HI and the water balance components day-by-day, and the yield and water use efficiency, the model becomes a powerful tool to design optimal irrigation strategies.

![Figure 3: The Soil fertility folder of the Crop Menu. This screenshot shows a software interface for calibrating soil fertility. It includes input fields for 'Soil Fertility Class' (Non limiting, Stress calibration), 'Average seasonal Kc' (0.73), 'Maximum canopy' (50 days), and 'Crop parameters' (at 50 days, at 55 days). A table shows 'Effect of soil fertility Reduction' for 'Canopy growth coefficient' (18%), 'Maximum canopy cover' (38%), 'Crop water productivity' (8%), and 'Average canopy cover decline' (0.78/day). A graph titled 'Canopy Cover (CC)' plots CC (0-100%) against Day (15-130), showing a bell-shaped curve peaking around day 50. A 'Close' button is at the bottom.](61d9180e505c3366d5ad3dd72408f6fe_img.jpg)

Figure 3: The Soil fertility folder of the Crop Menu. This screenshot shows a software interface for calibrating soil fertility. It includes input fields for 'Soil Fertility Class' (Non limiting, Stress calibration), 'Average seasonal Kc' (0.73), 'Maximum canopy' (50 days), and 'Crop parameters' (at 50 days, at 55 days). A table shows 'Effect of soil fertility Reduction' for 'Canopy growth coefficient' (18%), 'Maximum canopy cover' (38%), 'Crop water productivity' (8%), and 'Average canopy cover decline' (0.78/day). A graph titled 'Canopy Cover (CC)' plots CC (0-100%) against Day (15-130), showing a bell-shaped curve peaking around day 50. A 'Close' button is at the bottom.

Fig. 3. The Soil fertility folder of the Crop Menu

## ALGORITHMS AND CALCULATION PROCEDURES

Details are given for algorithms and calculation procedures used by AquaCrop to model the concepts presented by Steduto et al. (2009). Some emphasis is placed on the soil water balance, because a number of the equations for crop and biomass development and for final yield are presented by Steduto et al. (2009).

To accurately describe the retention, movement, and uptake of water in the soil profile throughout the growing season, AquaCrop divides the soil profile into small fractions. The soil profile is divided into soil compartments (12 by default) with thickness $\Delta z$ (0.10 m by default). However, AquaCrop will adjust the size of the compartments to cover the entire root zone. For deep root zones, $\Delta z$ is not constant but increases exponentially with depth, so that infiltration, evaporation (E), and transpiration (Tr) from the top soil layers can be described with sufficient detail. The hydraulic characteristics of each compartment are that of the soil horizon to which it belongs.

The soil water movement and root water uptake are simulated by a set of equations in terms of the dependent variable, $\theta$ , using a dimensionless drainage coefficient ( $\tau$ ) as derived from $K_{\text{sat}}$ (Raes et al., 2006) for downward water movement in the profile.

### Drainage

Drainage occurs when $\theta$ of a compartment is above FC. The amount of water that drains out of compartment $i$ , at time step $\Delta t$ , is described by an exponential drainage function that takes into account the water content ( $\theta$ ) and the drainage characteristic of the soil layer (Raes, 1982; Raes et al., 1988, 2006):

$$\frac{\Delta\theta_i}{\Delta t} = \tau(\theta_{\text{sat}} - \theta_{\text{FC}}) \frac{e^{\theta_i - \theta_{\text{FC}}} - 1}{e^{\theta_{\text{sat}} - \theta_{\text{FC}}} - 1} \quad [3]$$

where $\Delta\theta_i/\Delta t$ is the $\theta$ decrease during $\Delta t$ ( $\text{m}^3 \text{m}^{-3} \text{d}^{-1}$ ). When $\tau$ is close to one, a thoroughly wetted soil will drain in 1 or 2 d to FC. Low values of $\tau$ result in the slow drainage of the soil profile.

To simulate internal drainage in a profile composed of various compartments, not necessarily equally wet and may belong to soil layers with different $\tau$ values, the calculation procedure considers the drainage ability ( $\Delta\theta_i/\Delta t$ ) of the different compartments. The assumption made is that the total drainage of the compartments above will pass through the compartment below that has a drainage ability greater than or equal to that of the compartment above. By comparing drainage abilities and not water contents, the calculation procedure is independent of the soil layer, to which successive compartments may belong. If a compartment is reached with drainage ability smaller than the one above, the excess is stored in that compartment, thereby increasing its water content and its drainage ability. The drainage function used in AquaCrop mimics very well the infiltration and internal drainage observed in the field (García Cardenas, 2003; Raes et al., 2006; Descheemaeker, 2006; Geerts et al., 2008).

### Surface Run-Off and Infiltration

Surface run-off is simulated by the curve number method (USDA, 1964; Rallison, 1980; Steenhuis et al., 1995). The specified Curve Number ( $CN_{II}$ ) is adjusted for the simulated wetness of the top soil layer. Relationships derived from Smedema and Rycroft (1983), presenting corresponding CN values for antecedent moisture class (AMC) I (dry), II, and III (wet), are used. A soil depth of 0.3 m is considered by default when calculating the AMC. For simplicity, irrigation is assumed to be fully controlled; hence, the runoff subroutine (for rainfall) is bypassed for irrigation water infiltration and tailwater is assumed to be zero. If surface runoff from the field is important when irrigating, the above assumption requires that irrigation be specified as a net application amount. The maximum amount that can infiltrate the soil, either as rainfall or irrigation, is however limited by $K_{\text{sat}}$ of the topsoil layer.

After infiltrating into the soil, the water is stored in successive compartments from the top downward, governed by the limit imposed by the drainage ability ( $\Delta\theta/\Delta t$ ) of the different compartments.

### Soil Evaporation

Evaporation from soil takes place in two stages (Philip, 1957; Ritchie, 1972): an energy limiting stage (Stage I) and a falling rate stage (Stage II), when water transport to the surface from layers below is limiting. In AquaCrop, the cumulative Stage I evaporation (REW) is estimated as:

$$REW = 1000 \times (\theta_{\text{FC}} - \theta_{\text{air dry}}) \times Z_{\text{e,surf}} \quad [4]$$

where $\theta_{\text{air dry}}$ is soil water content ( $\text{m}^3 \text{m}^{-3}$ ) when air dry, and $Z_{\text{e,surf}}$ the thickness (m) of the evaporating surface layer. By assuming $\theta_{\text{air dry}}$ to be half of $\theta_{\text{pwp}}$ and 40 mm for $Z_{\text{e,surf}}$ , an agreement was found between REW and the cumulative evaporation for the energy limiting stage (Stage I evaporation), that is, the U value of Ritchie (1972). As long as readily evaporable water remains in the surface layer, E is in the energy limiting stage, and the rate is the maximum rate ( $E_{\text{e}}$ ). When all the REW is gone from the surface layer, E switches to the falling rate stage (Stage II) and water flows from the soil layer below ( $Z_{\text{e,top}}$ ) to the surface layer.

For bare soil, evaporation is described by the following equation, for both stages:

$$E = Kr \times E_{\text{e}} = Kr \times K_{\text{c,e,wet}} \times ET_0 \quad [5]$$

where $K_{\text{c,e,wet}}$ is the evaporation coefficient for fully wet and unshaded soil surface with a default value of 1.10 (Allen et al., 1998), and $Kr$ ( $\leq 1$ ) is the dimensionless evaporation reduction coefficient, and is 1 during Stage I evaporation. As Stage I ends and Stage II begins, $Kr$ decreases below 1 as water is depleted from $Z_{\text{e,top}}$ (Fig. 4). To account for the sharp decline in hydraulic conductivity with decreasing soil water content, an exponential equation is used to relate $Kr$ to relative water content of the soil layer ( $W_{\text{rel}}$ ):

$$0 \leq Kr = \frac{\exp^{f_{\text{e}} \times W_{\text{rel}}} - 1}{\exp^{f_{\text{e}}} - 1} \leq 1 \quad [6]$$

where, $f_K$ is a decline factor. At the start of Stage II $W_{rel}$ begins to decline below 1 and becomes 0 when $Z_{e,top}$ is air dry (Fig. 4). A thickness of 0.15 m is assigned initially for $Z_{e,top}$ . However, when $W_{rel}$ drops below a threshold (set at $W_{rel} = 0.4$ ), $Z_{e,top}$ expands to a maximum depth as a program parameter, with a default value of 0.3 m.

When $f_K$ takes a value of 4, a good fit was obtained between the square root of time approach (Ritchie, 1972) and the soil water content approach used by AquaCrop in the simulation of Stage II evaporation. Since $K_r$ varies strongly with $W_{rel}$ especially at the beginning of Stage II, the routine daily time step is inadequate and had to be divided into 20 equal fractions to obtain a differential solution for Eq. [5]. At the end of each small time step, the water content of the soil profile is updated and $K_r$ is estimated with Eq. [6].

When the soil is covered by the crop canopy, the rate of Stage I evaporation ( $E_x$ ) is given by:

$$E_x = (1 - CC^*) \times K_{c_{e,wet}} \times ET_o \quad [7]$$

where $CC^*$ is the fraction of the soil surface covered adjusted for micro-advective effects. The adjustment equation for $CC^*$ , based on the experimental data of Adams et al. (1976) and Vilalobos and Ferreres (1990), is:

$$CC^* = 1.72 \times CC - CC^2 + 0.30 \times CC^3 \quad [8]$$

When $CC$ declines (senesces) late in the season as dictated by phenology, or as induced by water stress, $E_x$ is given by:

$$E_x = (1 - CC^*) \times (1 - f_{CC} \times CC_{top}) \times K_{c_{e,wet}} \times ET_o \quad [9]$$

where $f_{CC}$ ( $\leq 1$ ) is the adjustment factor expressing the sheltering effect of the dead canopy cover, and should be parameterized based on whether the dead canopy retains more or less of its dead leaves, and $CC_{top}$ is the canopy cover before the senescence. If the canopy cover has reached its maximum size, $CC_{top} = CC_x$ . The default value for $f_{CC}$ is 0.60.

The adjustment of soil evaporation for mulches is given by

$$E_{x,adj} = E_x \left( 1 - f_m \frac{\text{Percent fully mulched}}{100} \right) \quad [10]$$

where $f_m$ ( $\leq 1$ ) is the adjustment factor for the effect of mulches on soil evaporation, and varies between 0.5 for mulches of plant material and is 1.0 for plastic mulches (Allen et al., 1998). When only a fraction of the soil surface is wetted by irrigation, $E_x$ is multiplied by the fraction of the surface wetted ( $f_w$ ) to adjust for partial wetting:

$$E_{x,adj} = E_x \times f_w \quad [11]$$

When rainfall occurs or water is added by irrigation, the infiltrated water replenishes the soil surface layer till REW is reached.

### Crop Transpiration

Crop transpiration when well watered ( $Tr_x$ ) is proportional to the canopy cover and given by:

$$Tr_x = CC^* \times K_{c_{tr,x}} \times ET_o \quad [12]$$

where $CC^*$ is the adjusted canopy cover (Eq. [8]), and $K_{c_{tr,x}}$ the coefficient for maximum crop transpiration. After the time required to reach $CC_x$ under optimal conditions and before senescence, the canopy ages slowly and undergoes a progressive though small reduction in transpiration and photosynthetic capacity. This is simulated by applying an adjustment factor ( $f_{age}$ ) that decreases $K_{c_{tr,x}}$ by a constant and slight fraction (e.g., 0.3%) per day, resulting in an adjusted crop coefficient ( $K_{c_{tr,adj}}$ ). When senescence is triggered, the transpiration and photosynthetic capacity of the green portion of the canopy drops more markedly with time. This is simulated by multiplying $K_{c_{tr,adj}}$ with another adjustment factor, $f_{sen}$ , which declines from 1 at the start of senescence ( $CC = CC_x$ ) to 0 when no green canopy cover remains ( $CC = 0$ ):

$$K_{c_{tr,sen}} = f_{sen} \times K_{c_{tr,adj}} \quad [13]$$

$$\text{with } f_{sen} = \left( \frac{CC}{CC_x} \right)^a \quad [14]$$

$$\text{and } Tr_x = CC^* \times K_{c_{tr,sen}} \times ET_o \quad [15]$$

The exponent $a$ is a program parameter and can be used to increase ( $a > 1$ ) or decrease ( $a < 1$ ) the drop in the transpiration/photosynthetic efficiency of the declining canopy.

To simulate the drop in crop transpiration as a result of (i) water shortage in the root zone (provoking stomatal closure) or (ii) excess water (resulting in anaerobic conditions), $Tr_x$ is multiplied with the stress coefficient for stomatal closure ( $K_{s_{sto}}$ ) or for water logging ( $K_{s_{aer}}$ ):

$$Tr = K_s \times Tr_x \quad [16]$$

![Figure 4: A graph showing the evaporation reduction coefficient Kr (y-axis, 0.0 to 1.0) versus relative soil water content (Wrel) (x-axis, 1 to 0). The x-axis is labeled 'start Stage II' at 1 and 'air dry' at 0. Three curves are plotted for different decline factors f_K: f_K = 1 (top curve), f_K = 4 (middle curve), and f_K = 8 (bottom curve). All curves start at Kr = 1.0 when Wrel = 1 and decrease as Wrel decreases towards 0. The curve for f_K = 1 is the highest, followed by f_K = 4, and then f_K = 8.](819cde2ed26b1ecc6d4a3ee283c843a1_img.jpg)

Figure 4: A graph showing the evaporation reduction coefficient Kr (y-axis, 0.0 to 1.0) versus relative soil water content (Wrel) (x-axis, 1 to 0). The x-axis is labeled 'start Stage II' at 1 and 'air dry' at 0. Three curves are plotted for different decline factors f_K: f_K = 1 (top curve), f_K = 4 (middle curve), and f_K = 8 (bottom curve). All curves start at Kr = 1.0 when Wrel = 1 and decrease as Wrel decreases towards 0. The curve for f_K = 1 is the highest, followed by f_K = 4, and then f_K = 8.

Fig. 4. The evaporation reduction coefficient $K_r$ for Stage II for various decline factors ( $f_K$ ) and relative soil water contents of $Z_{e,top}$ (top soil layer from which water flows to the evaporating surface layer). $W_{rel}$ is the relative water content of the soil layer.

![Figure 5: A graph showing the variation of the stress coefficient for low temperature effect on biomass production (Ksb) as a function of growing degrees (°C day). The y-axis represents the air temperature stress coefficient Ksb, ranging from 0.00 to 1.00. The x-axis represents growing degrees (°C day). A sigmoidal curve starts at 0.00 at the lower limit (0 °C day) and reaches 1.00 at the upper limit (GD_upper °C day). The region between the lower and upper limits is labeled 'air temperature limits full biomass production'.](4086a572c080354982c11f1de4d6921d_img.jpg)

Figure 5: A graph showing the variation of the stress coefficient for low temperature effect on biomass production (Ksb) as a function of growing degrees (°C day). The y-axis represents the air temperature stress coefficient Ksb, ranging from 0.00 to 1.00. The x-axis represents growing degrees (°C day). A sigmoidal curve starts at 0.00 at the lower limit (0 °C day) and reaches 1.00 at the upper limit (GD_upper °C day). The region between the lower and upper limits is labeled 'air temperature limits full biomass production'.

**Fig. 5. Variation of the stress coefficient for low temperature effect on biomass production ( $K_{sb}$ ) between its lower and upper limit defined in growing degrees. $GD_{upper}$ is the threshold (in growing degrees) below which the biomass production is limited by air temperature.**

The extraction out of the root zone of the water lost by transpiration (Eq. [16]), is based on the sink term $S$ (Feddes et al., 1978; Belmans et al., 1983), the rate of extraction per unit of soil volume ( $m^3 m^{-3} d^{-1}$ ). To obtain $S$ at a specific soil depth $i$ , the maximum extraction term, $S_{x_i}$ , is modulated by the water stress factor at that depth ( $K_{s_i}$ ):

$$S_i = K_{s_i} \times S_{x_i} \quad [17]$$

Depending on the water status the water stress factor is $K_{s_{sto}}$ or $K_{s_{acr}}$ . The relative depletion at that depth determines the value of $K_{s_i}$ (Eq. [1]). To account for the resistance of crops to short periods of water logging, the full effect of water logging is activated only after a certain number of days (default is three).

The total extraction rate is matched to $Tr$ by integrating Eq. [17] over the rooting depth, starting at the top of the soil profile and stopping when the sum $\Sigma(1000 S_i \Delta z_i)$ is equal to $Tr$ (Eq. [16]), or when the bottom of the root zone is reached:

$$Tr = \int_{i=top}^{i=bottom} 1000 (K_{s_i} \times S_{x_i}) \Delta z_i \leq K_{s_i} \times Tr_x \quad [18]$$

$Tr$ is less than Eq. [16] when the allowable extraction ( $S_{x_i}$ ) restricts water uptake (limited root volume).

### Green Canopy and Root Zone Development

As detailed in Steduto et al. (2009), the development of CC is described by two equations, with $CC_o$ , CGC, and $CC_x$ as inputs, and the late season canopy decline is described by an exponential decay function with CDC as input. When the simulated root zone water content drops below the upper threshold for canopy expansion, CGC is multiplied by $K_{s_{exp}}$ slowing the CC increase and delaying the achievement of $CC_x$ . For determinate crops, CC expansion stops once half of the flowering period is passed regardless whether $CC_x$ has been reached. The effect of high $CO_2$ concentrations on canopy development is simulated by increasing CGC.

If water stress becomes more severe and the water content in the root zone drops below the upper threshold for senescence, early senescence is triggered according to the fact that $K_{s_{sen}}$ is less than 1. The speed of canopy decline is calculated at each time step by combining the CDC specified as input and the $K_{s_{sen}}$ (Steduto et al., 2009).

The expansion of effective rooting depth is simulated by considering the $n$ th root of time till the maximum rooting depth is reached (Steduto et al., 2009). The rate of root zone expansion ( $dZ/dt$ ) starts to be reduced by water stress when the root zone depletion exceeds the upper threshold for stomatal closure. The reduction is determined by the magnitude of the $K_{s_{sto}}$ and a (negative) shape factor, $f_{shape}$ :

$$dZ_{adjusted} = dZ \frac{e^{\frac{K_{s_{sto}} f_{shape}}{f_{shape}}} - 1}{e^{f_{shape}} - 1} \quad [19]$$

Making $f_{shape}$ (default is $-6.0$ ) more negative minimizes the effect of water stress on root zone development, whereas root zone development is slowed significant in the early period of stress development if $f_{shape}$ is close to $-1.0$ .

### Biomass Production

Aboveground biomass ( $B$ ) is derived from the crop transpiration by means of the crop water productivity $WP^*$ normalized for $ET_o$ and $CO_2$ (Steduto et al., 2009). The effects of low temperatures and the chemical composition of the harvestable organs are considered as adjustment factors. The daily aboveground biomass production ( $m$ ) modified by the dimensionless factors is

$$m = K_{s_b} \times f_{wp} \times WP^* \times \left( \frac{Tr}{ET_o} \right) \quad [20]$$

where $m$ has the same units as $WP^*$ , $Tr$ and $ET_o$ are the crop transpiration and reference evapotranspiration on that day, $K_{s_b}$ is the stress coefficient for low temperature effect on biomass production, and $f_{wp}$ ( $\leq 1$ ) is the adjustment factor to account for differences in chemical composition of the vegetative biomass and harvestable organs, if any. Before flowering $f_{wp}$ is 1, and is set to a value less than 1 after the start of flowering if the reproductive organs being formed require more assimilated to make due to its composition.

For $K_{s_b}$ , the upper threshold is the minimum number of growing degrees ( $GD_{upper}$ ) required on a day to achieve full conversion of $Tr$ to $B$ , and the lower limit, set at $0^\circ C \cdot d$ , is the point when none of the $Tr$ is converted to $B$ . The variation of the adjustment factor with $GD$ is described by a logistic function (Fig. 5).

The normalization of $WP$ by $ET_o$ (Steduto et al., 2009) is achieved by dividing the biomass accumulated during a given period by the sum of the ratios of $Tr$ to $ET_o$ for each day during the same period. Thus, in Eq. [20] $WP^*$ is multiplied by the same ratio to obtain $m$ . To obtain $WP^*$ , the $WP$ normalized by $ET_o$ is further normalized for air $CO_2$ concentration ( $C_a$ ) by multiplying with the adjustment factor for $CO_2$ (Steduto et al., 2007), $f_{CO_2}$ :

$$f_{CO_2} = \frac{(C_a / C_{a,o})}{1 + 0.000138 \times (C_a - C_{a,o})} \quad [21]$$

where $C_{a,0}$ is the reference $CO_2$ concentration, taken to be the annual mean ( $369.47 \mu L L^{-1}$ ) measured at the Mauna Loa Observatory in Hawaii in the year 2000.

### Response of Harvest Index to Water Stress

Yield is the product of final biomass multiplied by HI. In the companion paper (Steduto et al., 2009) the conceptual basis for water stress effects on HI are given and the different ways stress can impact HI are described. Beginning at the start of flowering or tuber formation, HI is programmed to increase with time after a lag phase until physiological maturity. The value commonly reached at maturity under nonstress conditions is taken as the reference HI ( $HI_0$ ) for that species.

After the start of anthesis during the reproductive phase, water stress may alter the final HI depending on the stress timing and severity. As long as vegetative growth is still possible, water stress tends to enhance HI by restricting leaf growth, presumably decreasing the competition with reproductive growth. Hence, the rate of HI increase ( $dHI/dt$ ) speeds up if the threshold for canopy expansion is reached and $Ks_{exp}$ drops below 1.0 as soil water depletes:

$$\frac{dHI}{dt} = \left( 1 + \frac{(1 - Ks_{exp,i})}{a} \right) \times \left( \frac{dHI}{dt} \right)_0 \quad [22]$$

where $(dHI/dt)_0$ is the rate of increase of HI for nonstress conditions, and $a$ is an adjustable crop parameter. The positive impact of water stress on HI is accentuated as $a$ is adjusted downward, and diminished if adjusted upward. The equation applies as long as vegetative growth occurs, even if CC is already complete.

As water stress intensifies, not only leaf growth but also stomata opening are inhibited. The resultant reduction in assimilate supply presumably slows down the increase in HI and is described by:

$$\frac{dHI}{dt} = \sqrt[b]{Ks_{sto}} \left( 1 - \frac{1 - Ks_{sto,i}}{b} \right) \left( \frac{dHI}{dt} \right)_0 \quad [23]$$

where $b$ is an adjustable crop parameter. The negative impact of stress on HI is accentuated as $b$ is adjusted downward, and diminished if adjusted upward. The 10th root makes the adjustment small for slight to moderate stomatal stress and strong once the stress become very severe. In combination (Eq. [22] and [23]), because the threshold for leaf growth inhibition is much higher than that for stomata inhibition, as stress develops the rate of HI increase is first accelerated by the intensifying stress, and then is reduced as stomata close restricting photosynthesis. At a certain level of stress severity, the rate of HI increase is at the normal rate because the positive effect of leaf growth inhibition is counter balanced by the negative effect of stomata closure. As stress intensifies further, the overall effects would switch to negative with the proper setting of program parameters.

When water stress is severe enough to inhibit pollination, the effect on HI operates through $Ks_{pol}$ , as prescribed by:

$$HI_{0,adj} = [\sum (Ks_{pol} \times a \times F)] \times HI_0 \leq HI_0 \quad [24]$$

where $HI_{0,adj}$ is $HI_0$ adjusted for the reduction in pollination caused by stress, $Ks_{pol}$ is the water stress coefficient for pollination on a given day, $F$ is the fraction of the total number of potentially successful flowers going through anthesis on that day, and $a$ is a factor allowing for the effects of excessive sinks (potential fruits) and is a constant ( $>1$ ) for a given species or cultivar, being small or large depending on the amount of excessive sinks the crop produces. The summation is from the first to the last day of anthesis. Because $a$ may be substantially larger than 1 (e.g., 3), $HI_{0,adj}$ is limited to be not greater than $HI_0$ . AquaCrop uses a frequency distribution curve, skewed toward the early part of anthesis, to define $F$ for each day, as described in the Reference Manual (Raes et al., 2008).

Fereres and Soriano (2007) suggested that HI can be enhanced by preanthesis water stress which could be related to the relative reduction in preanthesis biomass. This effect is included in the program, although it may not occur in all crops. The adjustment is a function of the relative biomass ( $B_{rel}$ ) at the start of flowering (or tuber formation) and an adjustable crop parameter $\Delta HI_{x,ante} \cdot B_{rel}$ is the ratio of biomass ( $B$ ) to the potential biomass ( $B_p$ ), with the latter being the biomass produced under optimal conditions. $\Delta HI_{x,ante}$ is the maximal allowable increase in HI due to preanthesis stress, expressed in percentage. The adjustment in HI is confined to a range of $B_{rel}$ defined by:

$$\text{Range}(B_{rel}) = \frac{\ln(\Delta HI_{x,ante})}{5.62} \leq 1 \quad [25]$$

The exact value ( $\Delta HI_{x,ante}$ ) for the increase in percentage of HI is given by a sine function, with no adjustment at the lower and upper limits of the range and with maximum adjustment ( $\Delta HI_{x,ante}$ ) at 2/3 of the range (counting from the lower limit). Note that the larger is the $\Delta HI_{x,ante}$ , the wider is the range of $B_{rel}$ over which adjustment takes place. Details are given in the Reference Manual (Raes et al., 2008).

The program adjusts the HI daily during a simulation, for any of the aforementioned different effects of stress when appropriate. The model keeps track of the daily values of $Ks_{exp,i}$ , $Ks_{sto,i}$ and $Ks_{pol,i}$ and integrate their effects on HI in a single adjustment for $HI_0$ . The final HI at the end of yield formation, however, is not allowed to go above $HI_0$ by a certain percentage, specified either through calibration or by the user.

## OUTPUT

Simulation results are recorded in output files and can be retrieved in spread sheet programs for further processing and analysis. Results are plotted as well in a number of graphs which are updated at the end of each daily time step, as illustrated by Fig. 6. From such plots the user can follow throughout the simulation run the effects of water stress on crop development and production, and switch between several displays, each of a different set of outputs, presented in different folders. The capacity of simulating in short time steps and switching between several folders is particularly useful if one wants to study the effect of a particular event on a specific parameter.

![Figure 6: Graphical displays of Climate-Crop-Soil water output in the simulation Run Menu. The figure shows three stacked plots (a, b, c) over a 6-day period. Plot (a) shows soil water depletion (Dr) and root zone water content (TAW). Plot (b) shows canopy cover (CC) and early canopy senescence. Plot (c) shows transpiration (Tr) and stomatal closure (Dr > p_exp TAW). The plots are labeled with '1' through '6' at the bottom, corresponding to the days of the simulation.](352c5fab6f936356e9570761a02ab71e_img.jpg)

Figure 6: Graphical displays of Climate-Crop-Soil water output in the simulation Run Menu. The figure shows three stacked plots (a, b, c) over a 6-day period. Plot (a) shows soil water depletion (Dr) and root zone water content (TAW). Plot (b) shows canopy cover (CC) and early canopy senescence. Plot (c) shows transpiration (Tr) and stomatal closure (Dr > p_exp TAW). The plots are labeled with '1' through '6' at the bottom, corresponding to the days of the simulation.

Fig. 6. Graphical displays of _Climate-Crop-Soil water output_ in the simulation Run Menu.

Displayed in Fig. 6 is the folder of _Climate-Crop-Soil water_ with portions of it marked as (a) soil water depletion of the root zone (Dr), (b) corresponding development of the green canopy cover (CC), and (c) transpiration ( $Tr$ ), plotted as functions of time. The absence of rain during the time period 1–2 led to a drop in root zone water content below the threshold affecting canopy expansion ( $Dr > p_{exp} TAW$ ). This resulted in a slower canopy development than $CC_{pot}$ [plotted in light gray in the back (b) portion of figure]. In the time period 2–3, excessive rainfall raised the water content above FC. The CC expansion increased and reached $CC_x$ somewhat later than expected for optimal conditions. In the period 3–4, severe water stress resulted in stomata closure ( $Dr > p_{sto} TAW$ ), resulting in reduced crop transpiration ( $Tr < Tr_x$ ) and triggered somewhat later early canopy senescence ( $Dr > p_{sen} TAW$ ). In the transpiration graph (c), $Tr_x$ is plotted in light gray in the back. In the period 4–5, rainfall increased the soil water content, resulting in an increase of $Tr (= Tr_x)$ and an end of the early canopy decline. In the late season stage (period 5–6), the canopy declines as specified by the input.

During each simulation run, the amount of biomass produced and the expected final yield are continuously updated and displayed (labeled as d in Fig. 6). In the _Production_ folder of the simulation run menu, information is given on the ante and postanthesis impact of water stress on the adjustment of HI. In the Parameter of soil water balance folder, values are given for soil E, $Tr$ , runoff from rain, drainage and water use efficiency at the ratio of biomass to ET.

## SOFTWARE REQUIREMENTS

AquaCrop is developed in Borland DELPHI (Version 4.0, 1998) and is a public domain software. Interested potential users can obtain an installation disk (3 Mb) and a software copy of the Reference Manual from the Chief of the Water Unit (NRLW), of the Land and Water Division of FAO. The current e-mail address is provided on the FAO website ([www.FAO.org](http://www.FAO.org); verified 18 Feb. 2009). When running the

SETUP executable file, instructions are given for installing the software. AquaCrop runs under Microsoft Windows operating system (Version 98 and higher; Microsoft Corporation, Redmond, WA) and no special hardware or supporting software is required.

## CONCLUSIONS

The robustness of the model and its ability to describe the effects of water stress occurring at particular times during the growing season makes the model very useful for the design and evaluation of irrigation strategies, and to study the effects of location, soil type, field management techniques, and sowing dates on attainable, water-limited production and water use efficiency of a crop, under rainfed or irrigated agriculture. AquaCrop requires only a minimum of input data which are readily available or can easily be collected. The practitioner-type of end users, for whom AquaCrop is primarily developed, will find the model especially suitable because of its user-friendly environment.

## ACKNOWLEDGMENT

The authors would like to express their gratitude to the scientists, agriculturalists, extension professionals, and NGOs, being part of the AquaCrop Network, that have provided feedbacks and inputs during the development of the model and that have been also helpful for the preparation of this paper. The work of TCH is supported in part by the Karkheh River Basin project funded by the CGIAR Water and Food Challenging Program through ICARDA.

## REFERENCES

- Adams, J.E., G.F. Arkin, and J.T. Ritchie. 1976. Influence of row spacing and straw mulch on first stage drying. _Soil Sci. Soc. Am. J._ 40:436–442.
- Allen, R., L.S. Pereira, D. Raes, and M. Smith. 1998. Crop evapotranspiration—Guidelines for computing crop water requirements. Irrigation and Drainage Paper No. 56. FAO, Rome.
- Belmans, C., J.G. Wesseling, and R.A. Feddes. 1983. Simulation of the water balance of a cropped soil: SWATRE. _J. Hydrol._ 63:271–286.
- Descheemaeker, K. 2006. Pedological and hydrological effects of vegetation restoration in enclosures established on degraded hill slopes in the highlands of Northern Ethiopia. Ph.D. diss., _Dissertationes de Agricultura_ no. 725. K.U. Leuven Univ., Leuven, Belgium.
- FAO. 2009. ETo Calculator. Land and Water Digital Media Series No. 36. FAO, Rome.
- Farahani, H.J., G. Izzi, P. Steduto, and T.Y. Oweis. 2009. Parameterization and evaluation of AquaCrop for full and deficit irrigated cotton. _Agron. J._ 101:469–476 (this issue).
- Feddes, R.A., P.J. Kowalik, and H. Zaradny. 1978. Simulation of field water use and crop yield. Simulation Monographs, Pudoc, Wageningen, the Netherlands.
- Fereres, E., and M.A. Soriano. 2007. Deficit irrigation for reducing agricultural water use. _J. Exp. Bot._ 58:147–159.
- García Cardenas, M. 2003. Agroclimatic study and drought resistance analysis of Quinoa for an irrigation strategy in the Bolivian Altiplano. Ph.D. diss. _Dissertationes de Agricultura_, No. 556. K.U. Leuven Univ., Leuven, Belgium.
- García-Vila, M., E. Fereres, L. Mateos, F. Orgaz, and P. Steduto. 2009. Deficit irrigation optimization of cotton with AquaCrop. _Agron. J._ 101:477–487 (this issue).
- Geerts, S., D. Raes, M. García Cardenas, O. Condori, J. Mamani, R. Miranda, J. Cusicanqui, C. Taboada, E. Yucra, and J. Vacher. 2008. Could deficit irrigation be a sustainable practice for quinoa (_Chenopodium quinoa_ Willd.) in the Southern Bolivian Altiplano? _Agric. Water Manage._ 95:909–917.
- Geerts, S., D. Raes, M. García, R. Miranda, J.A. Cusicanqui, C. Taboada, J. Mendoza, R. Huanca, A. Mamani, O. Condori, J. Mamani, B. Morales,

- V. Osco, and P. Steduto. 2009. Simulating yield response to water of quinoa (_Chenopodium quinoa_ Willd.) with FAO-AquaCrop. _Agron. J._ 101:499–508 (this issue).
- Gommes, R.A. 1983. Pocket computers in agrometeorology. _Plant Production and Protection Paper No. 45_. FAO, Rome.
- Heng, L.K., S.R. Evett, T.A. Howell, and T.C. Hsiao. 2009. Calibration and testing of FAO aquacrop model for rainfed and irrigated maize. _Agron. J._ 101:488–498 (this issue).
- Hoogland, J.C., C. Belmans, and R.A. Feddes. 1981. Root water uptake model depending on soil water pressure heads and maximum water extraction rate. _Acta Hortic._ 119:123–135.
- Hsiao, T.C., L.K. Heng, P. Steduto, B. Rojas-Lara, D. Raes, and E. Fereres. 2009. AquaCrop—The FAO crop model to simulate yield response to water: III. Parameterization and testing for maize. _Agron. J._ 101:448–459 (this issue).
- McMaster, G.S., and W.W. Wilhelm. 1997. Growing degree-days: One equation, two interpretations. _Agric. For. Meteorol._ 87:291–300.
- Philip, J.R. 1957. Evaporation, moisture and heat fields in the soil. _J. Meteorol._ 14:354–366.
- Raes, D. 1982. A summary simulation model of the water budget of a cropped soil. Ph.D. diss. _Dissertationes de Agricultura_ no. 122. K. U. Leuven Univ., Leuven, Belgium.
- Raes, D., S. Geerts, E. Kipkorir, J. Wellens, and A. Sahli. 2006. Simulation of yield decline as a result of water stress with a robust soil water balance model. _Agric. Water Manage._ 81:335–357.
- Raes, D., H. Lemmens, P. Van Aelst, M. Vanden Bulcke, and M. Smith. 1988. _IRIS—Irrigation Scheduling Information System. Volume 1. Software Reference Manual_. K.U. Leuven, Dep. Land Management, Reference Manual 3. Leuven, Belgium.
- Raes, D., P. Steduto, T.C. Hsiao, E. Fereres, and L. Heng. 2008. AquaCrop calculation procedures reference manual, Prototype v. 2.4. FAO, Rome.
- Rallison, R.E. 1980. Origin and evolution of the SCS runoff equation. p. 912–924. In _Proc. Symp. on Watershed Management_. ASCE, New York.
- Rawls, W.J., D.L. Brakensick, and K.E. Saxton. 1982. Estimation of soil water properties. _Trans. ASAE_ 25:1316–1320.
- Ritchie, J.T. 1972. Model for predicting evaporation from a row crop with incomplete cover. _Water Resour. Res._ 8:1204–1213.
- Saxton, K.E., W.J. Rawls, J.S. Romberger, and R.I. Papendick. 1986. Estimating generalized soil-water characteristics from texture. _Soil Sci. Soc. Am. J._ 50:1031–1036.
- Smedema, L.K., and D.W. Rycroft. 1983. _Land drainage—Planning and design of agricultural drainage systems_. Batsford Ltd., London.
- Smith, M. 1985. Irrigation scheduling and water distribution. p. 497–510. In _Proc. Confér. Intern. Les besoins en Eau des Cultures_. INRA–ICID, Paris.
- Smith, M. 1990. CROPWAT—A computer program for irrigation planning and management. _Irrigation and Drainage Paper No. 46_. FAO, Rome.
- Soil Conservation Service. 1991. Soil–plant–water relationships. Section 15. Irrigation. p. 1–1–1–56. In _National engineering handbook_. Soil Conservation Service, USDA, Washington, DC.
- Steduto, P., T.C. Hsiao, and E. Fereres. 2007. On the conservative behavior of biomass water productivity. _Irrig. Sci._ 25:189–207.
- Steduto, P., T.C. Hsiao, D. Raes, and E. Fereres. 2009. AquaCrop—The FAO crop model to simulate yield response to water: I. Concepts and underlying principles. _Agron. J._ 101:426–437 (this issue).
- Steenhuis, T.S., M. Winchell, J. Rossing, J.A. Zollweg, and M.F. Walter. 1995. SCS Runoff equation revisited for variable-source runoff areas. _J. Irrig. Drain. Eng._ 121:234–238.
- USDA. 1964. Estimation of direct runoff from storm rainfall. p. 1–24. In _National Engineering Handbook_. Soil Conservation Service, USDA, Washington, DC.
- Villalobos, F.J., and E. Fereres. 1990. Evaporation measurements beneath corn, cotton, and sunflower canopies. _Agron. J._ 82:1153–1159.
