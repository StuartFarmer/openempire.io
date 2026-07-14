# Biometrika Trust ---

Random Dispersal in Theoretical Populations

Author(s): J. G. Skellam

Reviewed work(s):

Source: _Biometrika_, Vol. 38, No. 1/2 (Jun., 1951), pp. 196-218

Published by: [Biometrika Trust](#)

Stable URL: <http://www.jstor.org/stable/2332328>

Accessed: 10/03/2013 01:45

---

Your use of the JSTOR archive indicates your acceptance of the Terms & Conditions of Use, available at  
<http://www.jstor.org/page/info/about/policies/terms.jsp>

JSTOR is a not-for-profit service that helps scholars, researchers, and students discover, use, and build upon a wide range of content in a trusted digital archive. We use information technology and tools to increase productivity and facilitate new forms of scholarship. For more information about JSTOR, please contact support@jstor.org.

![JSTOR logo, featuring a stylized 'J' and 'S' inside a square frame, with the word 'STOR' below it.](1d7527f4316cfe2d342b08d1653d1592_img.jpg)

JSTOR logo, featuring a stylized 'J' and 'S' inside a square frame, with the word 'STOR' below it.

_Biometrika Trust_ is collaborating with JSTOR to digitize, preserve and extend access to _Biometrika_.

<http://www.jstor.org>

# RANDOM DISPERSAL IN THEORETICAL POPULATIONS

BY J. G. SKELLAM

_The Nature Conservancy, London_

## SYNOPSIS

The random-walk problem is adopted as a starting point for the analytical study of dispersal in living organisms. The solution is used as a basis for the study of the expansion of a growing population, and illustrative examples are given. The law of diffusion is deduced and applied to the understanding of the spatial distribution of population density in both linear and two-dimensional habitats on various assumptions as to the mode of population growth or decline. For the numerical solution of certain cases an iterative process is described and a short table of a new function is given. The equilibrium states of the various analytical models are considered in relation to the size of the habitat, and questions of stability are investigated. A mode of population growth resulting from the random scattering of the reproductive units in a population discrete in time, is deduced and used as a basis for a study on interspecific competition. The extent to which the present analytical formulation is applicable to biological situations, and some of the more important biological implications are briefly considered.

## 1. INTRODUCTION

1.1. It is now fifty years since the publication of _The Origin of the British Flora_ by Clement Reid (1899). In it is suggested an interesting numerical problem on the rate of dispersal of plants. Reid states: 'Though the post-glacial period counts its thousands of years, it was not indefinitely long, and few plants that merely scatter their seed could advance more than a yard in a year, for though the seed might be thrown further, it would be several seasons before an oak for instance, would be sufficiently grown to form a fresh starting point. The oak, to gain its present most northerly position in North Britain after being driven out by the cold, probably had to travel fully six hundred miles, and this without external aid would take something like a million years.'

1.2. At the end of the last century, biologists, unlike physicists, rarely formulated such problems in terms of simplified abstract models, due no doubt to the comparatively greater complexity of biological systems. A beginning might have been made on the subject of dispersal, for much of the necessary mathematical technique had been developed already, and, in fact, had been utilized by Maxwell (1860) in developing a kinetic theory of gases based on the behaviour of an infinity of perfectly elastic spheres moving at random. The present century has witnessed the great success of the analytical method to quote only the work of Fisher (1930), Haldane (1932) and Wright (1931) in evolutionary genetics, and of Volterra (1931), Lotka (1925, 1939) and Kostitzin (1939) in ecology. Nevertheless, biologists as a whole have been reluctant to develop the analytical as distinct from the purely statistical approach, and apart from the pioneer work of Karl Pearson (1906) and of Brownlee (1911), the mathematical aspects of the problem of dispersal have not received the attention they deserve.

## 2. RANDOM DISPERSAL AND DIFFUSION

2.1. _Random displacement._ The mathematical methods employed in the present treatment are largely the natural outcome of the solution of the well-known random-walk problem associated with Pearson (1906), Rayleigh (1919) and Kluyver (1905), and reviewed more recently by Chandrasekhar (1943). In the simplest form of this problem, a particle on a line jumps one place to the right or one to the left, both being equally likely. It is easily seen that the probability distribution is:

| Position      | $\bar{3}$     | $\bar{2}$     | $\bar{1}$     | 0             | 1             | 2             | 3             |
| ------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- |
| After 1 jump  | .             | .             | $\frac{1}{2}$ | .             | $\frac{1}{2}$ | .             | .             |
| After 2 jumps | .             | $\frac{1}{4}$ | .             | $\frac{2}{4}$ | .             | $\frac{1}{4}$ | .             |
| After 3 jumps | $\frac{1}{8}$ | .             | $\frac{3}{8}$ | .             | $\frac{3}{8}$ | .             | $\frac{1}{8}$ |

and so on, with the general result that after $n$ jumps the distribution is binomial with variance equal to $n$ . As $n$ becomes large the distribution 'tends to' normality.

A natural extension of the problem to $N$ dimensions, in which the particle moves on a rectangular lattice, yields 'in the limit' an $N$ -variate normal distribution which is the product of $N$ independent distributions.

An alternative model for the two- or three-dimensional analogue consists of a randomly kinked chain with rotatable links. If one end is fixed, the probability distribution of the position of the free end tends to normality when the number of links is large (see Uspensky, 1937). In the two-dimensional case with only seven links it has been shown by actual calculation by Pearson (1906) that the normal distribution provides a remarkably good approximation.

The model considered by Pearson is, however, somewhat artificial when applied to migration in that the links (or flights) are taken as being equal in size. In practice they will vary. The important special case where the probability distribution of the end-point of a flight is bivariate-normal (with the starting point of the flight as the centre) has been considered by Brownlee (1911). A solution of the more general case is outlined below.

2.2. _A spreading population._ Consider a surface of unlimited extent approximating to a Euclidean plane with co-ordinate axes $OX$ and $OY$ , and in the immediate neighbourhood of the origin let there be to start with a single self-reproducing particle of a species not otherwise represented. The probability distribution of the position of a particular descendant after $n$ generations may be deduced once the characteristic function of the probability distribution of offspring about their parent is given. For a parent located at $(\xi, \eta)$ , let this function be

$$\phi(t, u | \xi, \eta) = \exp \{ i\xi t + i\eta u + \Sigma (\kappa_{rs} t^r u^s / r! s!) \}.$$

The $\kappa_{rs}$ are assumed independent of $\xi$ and $\eta$ , for it is reasonable to suppose that the location of the parent does not affect the _form_ of the distribution of the offspring. Let the cumulative\* distribution function for the position of a particle in the $n$ th generation be $F_n(\xi, \eta)$ with $\phi_n(t, u)$ as the corresponding characteristic function. Assuming that the generations do not overlap in time, we then have

$$\phi_{n+1}(t, u) = \iint \phi(t, u | \xi, \eta) dF_n(\xi, \eta) = \phi(t, u | 0, 0) \iint e^{i\xi t + i\eta u} dF_n(\xi, \eta) = \phi(t, u | 0, 0) \phi_n(t, u).$$

\* Here and below in this paper the customary parentheses surrounding terms in the denominator, to the right of the solidus, have been omitted. Thus $\dots / r! s! \}$ should be printed $\dots / (r! s!)$ in accordance with the common convention. It is considered, however, that no confusion will result here from such omissions.

Clearly $\phi_n = [\phi(t, u | 0, 0)]^n$ . It is apparent that all cumulants increase $n$ -fold (as in the summation of independent variables). Standardization of the scale is effected by changing $n\kappa_{rs}$ to $n\kappa_{rs}/n^{r+s}$ . The approach to normality is obviously very rapid when the distribution of offspring about their parent is roughly normal to begin with. In the present treatment we assume that $\kappa_{01} = \kappa_{10} = 0$ so that there is no drift. Nevertheless, it should be noted that a slight systematic drift, no matter how small, is _ultimately_ the most important cause of displacement, that is, when $n$ is chosen sufficiently large.

The distribution of the position of a particle of the $n$ th generation will henceforth be taken as

$$dF_n(x, y) = \pi^{-1}a^{-2}n^{-1} \exp\{-[x^2 + y^2]/na^2\} dx dy. \quad (1)$$

Since we shall be concerned mainly with absolute distances from the origin, it is convenient to make the polar transformation $x = r \cos \theta$ , $y = r \sin \theta$ . From (1) we then obtain

$$dF_n = \pi^{-1}a^{-2}n^{-1} \exp\{-r^2/na^2\} r dr d\theta \quad (0 \leq \theta < 2\pi, 0 \leq r < \infty). \quad (2)$$

If $r_0$ is the distance from the origin of an individual value chosen at random, then the probability that $r - \frac{1}{2}dr \leq r_0 < r + \frac{1}{2}dr$ is obtained by integrating over $\theta$ , giving the radial probability density

$$f(r | n, a^2) = \exp\{-r^2/na^2\} 2r/na^2 \quad (0 \leq r < \infty). \quad (3)$$

The parameter $a^2$ is to be interpreted as the mean-square dispersion per generation, analogous with the mean-square velocity in Maxwell's distribution. The maximum likelihood estimate of $a^2$ based on $\nu$ observed values of $r$ is simply $\hat{a}^2 = \Sigma r^2/\nu$ .

Of the population spread out after $n$ generations, that proportion lying outside a circle of radius $R$ is

$$p = \int_R^\infty \exp\{-r^2/na^2\} 2r dr/na^2 = \exp\{-R^2/na^2\}. \quad (4)$$

In a subsequent argument it is essential to make $p$ very small indeed. By choosing $p = 1/N_n$ , where $N_n$ is the final population after $n$ generations, it follows that only one particle can be expected outside a circle of radius $R_n = (na^2 \log N_n)^{1/2}$ . If during this period the population has increased geometrically in accordance with the relation $N = e^{c\gamma^2}$ (where $c = \gamma^2$ may be termed the Malthusian parameter, as in Fisher (1930)), we obtain immediately the relation

$$R_n/n = a\gamma. \quad (5)$$

If a circular contour is drawn in the $XY$ plane through all points having an arbitrarily chosen constant areal population density, then as time passes, the contour expands outwards. From the condition, $\gamma^2 n - \log n - r^2/na^2 = \text{constant}$ , it is easily seen that

$$r_{n+1} - r_n \sim a\gamma. \quad (5a)$$

The ultimate velocity of propagation of this 'wave-front' (D. G. Kendall, 1948) is therefore the same as the constant velocity of expansion of the circle within which all but one of the population can be 'expected' to lie.

**2.3. A numerical illustration.** Let us consider the application of equation (4) to Reid's problem. We can clearly establish a rigorous conclusion in the form of an inequality provided that we can fix appropriate bounds to the various parameters.

The oak does not produce acorns until it is sixty or seventy years old, and even then it is not mature. It then produces acorns over a period of several hundred years. The rate of population expansion is obviously very much less than it would be if all the immediate offspring of a single individual could come into existence in the sixtieth year of its life. We

are certainly safe in taking the generation time as not less than sixty years. Now according to De Geer (1910) the final recession of the ice started at about 18,000 B.C., and yet in Roman Britain (Tansley, 1939, p. 171) oak forests were apparently well established throughout the country. It appears safe to take $n \leq 300$ .

The number of acorns produced by an oak in the course of its life must be prodigious. Nevertheless, under typical present-day conditions almost every acorn which falls to the ground in autumn is consumed by birds and mammals (Watt, 1919). Of those remaining, some decay and many fail to germinate. Mortality among the young seedlings is very high, and even when not overshadowed it seems that only about 1 % of the seedlings are likely to survive the next three years. Though there has been much speculation, little is really known about the biological conditions following the last glaciation. Even so, it seems perfectly safe to assume that the average number of mature daughter oaks produced by a single parent oak did not exceed 9 million. To most biologists such a figure must appear unnecessarily high, but we must remember that it is the rate of population growth at the periphery of the advancing 'wave' which matters most, and here there will be least competition.

The fact that the British Isles are of finite extent with irregular coastline does not detract from the power of the argument, for it is obvious that such a shape in no way encourages the advancing 'wave-front'.

We then have $R/a < 300 \sqrt{\log 9,000,000} = 1200$ .

In the original form of the problem as stated by Reid, $R$ is given as 600 miles. It then follows that $a$ (the root mean square distance of daughter oaks about their parent) $> \frac{1}{2}$ mile. On these premises the conclusion which Reid reached appears inescapable—namely, that animals such as rooks must have played a major role as agents of dispersal.

If, however, we regard the upper bounds of $a, n, \gamma$ (given above) as collectively excessive, we are driven to accept the view that the last glaciation was not as extensive as was previously believed (W. B. Wright, 1937), and to suppose that the oak population regenerated from scattered pockets which survived in favourable valleys.

At this point it is interesting to consider the actual succession of forest trees since glacial times as revealed by pollen analysis (Godwin, 1934). In late sub-arctic and pre-boreal times, birches with their small, winged fruits, willows with their plumed seeds, and pine with its winged seeds, were able to spread quickly and were plentiful. Hazel, however, did not reach its maximum until Boreal times, and oak with still larger fruits not until much later. It is quite possible that the relatively different rates of dispersal were not unimportant in determining the order of succession.

2.4. _The dispersal of small animals._ The results already deduced can be applied equally well to the dispersal of small animals such as earthworms and snails. For example, if the mean square 'dispersion' per minute of a wingless ground beetle wandering at random is 1 yard<sup>2</sup>, then after a season of 6 months, say, without rest, the R.M.S.D. of the resulting probability distribution is only 500 yards. The probability that after 6 months the beetle wanders more than a mile from the starting point is less than 8 in a million. Without external aid a period of time equivalent to 1,000,000 seasons would be required to raise the R.M.S.D. to 290 miles. The figures, however, are slightly deceptive, for the final position arrived at is in general a great deal nearer the origin than the farthestmost position previously reached. Nevertheless, calculations of this kind clearly indicate in these cases the importance in the long run of rare accidental displacements due to external agencies such as high gales, floating plant material, the muddy feet of birds and mammals.

2.5. _Empirical confirmation._ In practice there is rarely sufficient information to construct the contours of population density with accuracy. One contour, however, can sometimes be drawn—that for the low ‘threshold’ density (depending on the thoroughness of the survey) at which the population begins to escape notice altogether.

Equation (4), derived initially on theoretical grounds, is well illustrated by the spread of the muskrat, _Ondatra zibethica_ L., in central Europe since its introduction in 1905. Fig. 1, based on Ulbrich (1930), shows the apparent boundaries for certain years. If we are prepared to accept such a boundary as being representative of a theoretical contour, then we must regard the area enclosed by that boundary as an estimate of $\pi r^2$ . The relation between the time and $\sqrt{\text{area}}$ is shown graphically in Fig. 2.

![Figure 1: A map showing the spread of the muskrat (Ondatra zibethica) in central Europe from 1905 to 1927. The map displays concentric contour lines representing population density boundaries for the years 1905, 1909, 1911, 1915, 1920, and 1927. Major cities are marked: Breslau, Vienna, and Munich. An 'X' marks the starting point in 1905.](ac99eff233b8fe51d30f499e7413c345_img.jpg)

Figure 1: A map showing the spread of the muskrat (Ondatra zibethica) in central Europe from 1905 to 1927. The map displays concentric contour lines representing population density boundaries for the years 1905, 1909, 1911, 1915, 1920, and 1927. Major cities are marked: Breslau, Vienna, and Munich. An 'X' marks the starting point in 1905.

Fig. 1

![Figure 2: A graph showing the relationship between the square root of the area (sqrt(Area)) on the y-axis and time (Year) on the x-axis. The x-axis has major ticks at 1910, 1920, and 1930. Five data points are plotted, showing a linear increase. The points correspond to the years 1905, 1909, 1911, 1915, and 1920 from the map in Figure 1. A straight line is drawn through the points, starting from the origin.](e1dda754c2c88a8ad0b968aea4fc0786_img.jpg)

Figure 2: A graph showing the relationship between the square root of the area (sqrt(Area)) on the y-axis and time (Year) on the x-axis. The x-axis has major ticks at 1910, 1920, and 1930. Five data points are plotted, showing a linear increase. The points correspond to the years 1905, 1909, 1911, 1915, and 1920 from the map in Figure 1. A straight line is drawn through the points, starting from the origin.

Fig. 2

2.6. _The analogy with diffusion._ If a random particle suffers a displacement $\epsilon$ in any direction at regular intervals of time ( $t, t + \omega, t + 2\omega, \dots$ ), and if the probability density is denoted by $\psi$ , it is clear that $\psi(x, y, t + \omega)$ is the mean value of $\psi(\xi, \eta, t)$ for all $(\xi, \eta)$ on a circle of radius $\epsilon$ around $(x, y)$ . That is,

$$\psi(x, y, t + \omega) = \frac{1}{2\pi} \int_0^{2\pi} \psi(x + \epsilon \cos \theta, y + \epsilon \sin \theta, t) d\theta.$$

Expanding by Taylor's theorem and noting that

$$\begin{aligned} \int_0^{2\pi} \cos \theta d\theta &= \int_0^{2\pi} \sin \theta d\theta = \int_0^{2\pi} \sin \theta \cos \theta d\theta = 0, \\ \int_0^{2\pi} \cos^2 \theta d\theta &= \int_0^{2\pi} \sin^2 \theta d\theta = \pi, \end{aligned}$$

we obtain for infinitesimally small $\epsilon$ and $\omega$ the relation

$$\frac{\partial \psi}{\partial t} = \frac{1}{4} \frac{\epsilon^2}{\omega} \nabla^2 \psi, \quad (6)$$

where

$$\nabla^2 = \frac{\partial^2}{\partial x^2} + \frac{\partial^2}{\partial y^2}.$$

The partial differential equation (6) is of course well known in connexion with the conduction of heat and related problems in mathematical physics (Jeans, 1921). The one-dimensional form has been applied by R. A. Fisher (1922) to the problem of the distribution of gene differences, and the three-dimensional form by Rashevsky (1948) to problems arising from the diffusion of materials from and into living cells.

It should be noted that the fundamental differential equation (6) is satisfied by the distribution

$$\psi = \pi^{-1} a^{-2} t^{-1} \exp \{-(x^2 + y^2)/ta^2\},$$

already considered (see equation (1)), with the unit of time as one generation and $a^2 = \epsilon^2/\omega$ .

It is apparent that many ecological problems have a physical analogue, and that the solution of these problems will require treatments and the use of functions with which we are already very familiar. Unlike most of the particles considered by physicists, however, living organisms reproduce, and members of the same and of different species interact. As a result the equations of mathematical ecology are often of a new and unusual kind (see, for example, Volterra (1931)), and require special treatment.

## 3. DISPERSAL AND POPULATION DENSITY

3.1. _Modes of population growth._ Many problems on dispersal cannot be formulated unless some law of population growth (in the absence of dispersal) is assumed. As long as the population is small or shows a natural tendency to decrease, the Malthusian law $dN/dt = cN$ is usually satisfactory. If the population is not small the Pearl-Verhulst logistic law is more appropriate.

This law may be written in the form

$$\frac{dN}{dt} = cN - lN^2, \quad (7)$$

where, following Kostitzin (1939), $c$ may be termed the coefficient of increase and $l$ the limiting coefficient. Since a stable population level exists at $M \equiv c/l$ , the law is often written in the form

$$\frac{dN}{dt} = cN(M - N)/M. \quad (7a)$$

For our present purpose it is convenient to use the concept of population density denoted by $\Psi$ , a function of time and place. In general, the vital coefficients will also vary. The logistic law may then be written

$$\frac{\partial}{\partial t} \Psi(x, y, t) = c_1(x, y) \Psi - c_2(x, y) \Psi^2. \quad (8)$$

In the simplest cases where the vital coefficients remain constant throughout the habitat under consideration, the unit of population density may be chosen for convenience as that prevailing when $t \rightarrow \infty$ , and the law then takes the very simple form

$$\frac{d\Psi}{dt} = c\Psi(1 - \Psi). \quad (9)$$

When conditions become extremely unfavourable and ultimate survival not possible, the logistic law (7) may still be applied with $c$ negative ( $= -g^2$ ). The population declines rapidly unless maintained by immigration. Such a population may be termed negative-logistic.

A convenient change of scale then gives

$$\frac{d\Psi}{dt} = -g^2\Psi(1 + \Psi).$$

Two further laws of population growth applicable to populations which are discrete in time are deduced in §§ 4.1 and 4.3.

3.2. _Centres of multiplication and extinction._ We now consider the distribution in space of the density of a population which by reason of random dispersal, tends to flow from regions in which conditions are favourable to regions in which they are unfavourable. Whether a steady state can exist or not depends on the ability of the population in the favourable regions to make good the decline in the unfavourable ones.

Mathematically it is simpler to consider a linear habitat such as a coastal zone (Fisher, 1937) or the bank of a river. In these cases we are justified in assuming that an adjustment has been made in the vital coefficients to allow for diffusion inland, for this danger may be regarded as one of the many hazards associated with the habitat. Moreover, as will be apparent later, the mathematical form of the Malthusian law and of the logistic law (7) persists almost unchanged when the rate of diffusion inland is deducted from the rate of population growth.

The two-dimensional problems which most readily lend themselves to mathematical treatment are those with radial symmetry. Rough approximations to circles are sometimes afforded by islands, hill tops, marshes, patches of woodland, and approximations to annuli are provided at the margins of lakes, by the zones on hills of a conical or hemispherical shape, or even by the zonation created by rabbits around their individual burrows or around such patches of woodland as they infest (see, for example, Tansley, 1939, pp. 587, 505, 138, 141).

3.3. _Malthusian populations in linear habitats._ The one-dimensional form of (6) expressing the effect of random dispersal is

$$\frac{\partial\psi}{\partial t} = \frac{1}{2} \frac{c^2}{\omega} \frac{\partial^2\psi}{\partial x^2}. \quad (10)$$

In terms of population density, with $a^2 = c^2/\omega$ , we then have as the combined effect of dispersal and population growth

$$\frac{\partial\psi}{\partial t} = \frac{1}{2}a^2 \frac{\partial^2\Psi}{\partial x^2} + c\Psi. \quad (11)$$

The condition for a steady state, assuming it to exist, is

$$\frac{d^2\Psi}{dx^2} + \frac{2c}{a^2} \Psi = 0. \quad (12)$$

_Case (i)._ Bordering on a suitable habitat is an unfavourable zone extending indefinitely in one direction:

$$c = -g^2 \quad \text{in} \quad x_b \leq x < \infty, \quad \Psi(x_b) = B, \quad \Psi(\infty) = 0.$$

Solution: $\Psi = B e^{-m(x-x_b)}, \quad \text{where} \quad m = g\sqrt{2/a}.$

_Case (ii)._ An unfavourable interval is flanked at both ends by a suitable habitat:

$$c = -g^2 \quad \text{in} \quad -x_b \leq x \leq x_b, \quad \Psi(-x_b) = \Psi(x_b) = B.$$

Solution: $\Psi = B \cosh mx / \cosh mx_b.$

_Case (iii)._ An apparently suitable habitat is flanked on either side by conditions which are _extremely_ unfavourable. (It is assumed, for simplicity, that the organisms show no marked negative tactic response to the changed conditions, so that there is no appreciable reflexion at the boundary):

$$c = \gamma^2 \quad \text{in} \quad -x_b \leq x \leq x_b, \quad \Psi(-x_b) = \Psi(x_b) = 0.$$

Solutions that are non-negative but not zero everywhere in the interval are possible only when $x_b = \frac{1}{2}\pi a/\gamma \sqrt{2}$ , and we then have

$$\Psi = C \cos(\gamma x \sqrt{2}/a). \quad (13)$$

When $x_b$ is greater than the critical value given above, the population increases indefinitely, and when $x_b$ is less than this value the population declines to extinction. For consider the partial differential equation (11) with $c = \gamma^2$ subject to the boundary conditions

$$\Psi(x_b, t) = \Psi(-x_b, t) = 0 \quad (0 \leq t < \infty),$$

and an arbitrary initial state developed as a Fourier half-range sine series

$$\Psi(x, 0) = \sum_{s=1}^{\infty} A_s \sin(\frac{1}{2}s\pi[x+x_b]/x_b).$$

The solution is

$$\Psi(x, t) = \sum_s A_s e^{k_s t} \sin(\frac{1}{2}s\pi[x+x_b]/x_b),$$

where $k_s = \gamma^2 - \frac{1}{2}a^2(\frac{1}{2}s\pi/x_b)^2$ . The first of the $k_s$ is obviously the greatest, so that in the course of time the solution is dominated by its first term, which tends to $\infty$ , (13), or 0 as $x_b \gtrless \frac{1}{2}\pi a/\gamma \sqrt{2}$ .

3.4. _Logistic populations in linear habitats._ From (10) and (9) we obtain the fundamental equation

$$\frac{\partial \Psi}{\partial t} = \frac{1}{2}a^2 \frac{\partial^2 \Psi}{\partial x^2} + \gamma^2 \Psi(1 - \Psi). \quad (14)$$

Mathematically this is the same as an equation of R. A. Fisher (1937) given as

$$\frac{\partial p}{\partial t} = k \frac{\partial^2 p}{\partial x^2} + mpq$$

in connexion with the problem of gene flow in a linear population. Gene frequency $p$ corresponds to population density and the term in $pq \equiv p(1-p)$ expressing the effect of natural selection corresponds to the term in $\Psi(1-\Psi)$ expressing logistic growth. The results deduced here in connexion with ecological problems automatically apply to the genetic analogues where they exist. Whereas, however, $\Psi$ may exceed unity, $p$ is restricted to $0 \leq p \leq 1$ . Negative solutions are inadmissible in both types of problem.

The condition for a steady state is

$$\frac{d^2 \Psi}{dz^2} + \Psi(1 - \Psi) = 0, \quad \text{where} \quad z = \gamma x \sqrt{2}/a, \quad (15)$$

or in the case of a negative-logistic population (see (3.1))

$$\frac{d^2 \Psi}{dz^2} - \Psi(1 + \Psi) = 0, \quad \text{where} \quad z = \gamma x \sqrt{2}/a. \quad (16)$$

The substitution $u = (\Psi_0 - \Psi)/\Psi_0(1 - \Psi_0)$ , where $\Psi_0 = \Psi(x)|_{x=0}$ ,

converts (15) into $u'' = 1 + \lambda u - \frac{1}{4}(1 - \lambda^2)u^2$ , where $\lambda = 2\Psi_0 - 1$ . (17)

Case (i).
$$c = \gamma^2, \quad 0 < \Psi_0 < 1, \quad \left. \frac{d\Psi}{dx} \right|_{x=0} = 0.$$

Since $\frac{d^2u}{dz^2} = \frac{du}{dz} \frac{d}{du} \left( \frac{du}{dz} \right)$ we find on integrating (17), subject to the condition $du/dz = 0$ when $u = 0$ , that

$$\frac{1}{2} \left( \frac{du}{dz} \right)^2 = u + \frac{1}{2} \lambda u^2 - \frac{1}{12} (1 - \lambda^2) u^3.$$

Hence
$$|z| \sqrt{2} = \int_0^u \{ \tau(1 - \alpha^2 \tau)(1 + \beta^2 \tau) \}^{-\frac{1}{2}} d\tau,$$

where
$$4\alpha^2 = \left( \frac{4 - \lambda^2}{3} \right)^{\frac{1}{2}} - \lambda \quad \text{and} \quad 4\beta^2 = \left( \frac{4 - \lambda^2}{3} \right)^{\frac{1}{2}} + \lambda.$$

In terms of Legendre's elliptic integrals, of which there are tables (1825), we then have the solution

$$z\rho^{-\frac{1}{2}} = F(k, \tfrac{1}{2}\pi) - F(k, \arccos \alpha \sqrt{u}),$$

where
$$\rho^2 = \alpha^2 + \beta^2 \quad \text{and} \quad k^2 = 2\beta^2 \left/ \left( \frac{4 - \lambda^2}{3} \right)^{\frac{1}{2}} \right.$$

The inversion of this result leads to a simpler expression in terms of the Jacobian elliptic function $\text{sd}(y)$ denoting $\sin \text{am } y/\Delta \sin y$ . We thereby write

$$\sqrt{u} = \text{sd}(2^{-\frac{1}{2}}\rho z, k)/\rho. \quad (18)$$

In practice, however, it is no more troublesome to compute a particular solution by iteration.

For under the condition $\left. \frac{d\Psi}{dz} \right|_{z=0} = 0$ we may write equation (15) in the form

$$\Psi(z) = \Psi(0) - \int_0^z d\tau \int_0^\tau \Psi(\xi) [1 - \Psi(\xi)] d\xi.$$

Approximate values of $\Psi$ are substituted on the right and the integrations performed numerically as in §3.9.

If we make $\Psi_0$ vanishingly small and proceed to determine $z_b$ such that $\Psi(z_b) = 0$ , we find that $u(z_b) \rightarrow 1$ and $\rho \rightarrow 2^{-\frac{1}{2}}$ . Equation (18) passes formally into $2^{-\frac{1}{2}} = \sin \frac{1}{2}z_b$ , confirming the result $x_b = \frac{1}{2}\pi a/\gamma \sqrt{2}$ given in §3.3 (iii).

Case (ii).
$$c = \gamma^2, \quad 1 < \Psi_0 < \frac{3}{2}, \quad \left. \frac{d\Psi}{dx} \right|_{x=0} = 0.$$

Following the same procedure as before we find

$$|z| \sqrt{2} = \int_0^u \{ \tau(1 + \alpha^2 \tau)(1 + \beta^2 \tau) \}^{-\frac{1}{2}} d\tau,$$

where
$$4\alpha^2 = \lambda - \left( \frac{4 - \lambda^2}{3} \right)^{\frac{1}{2}} \quad \text{and} \quad 4\beta^2 = \lambda + \left( \frac{4 - \lambda^2}{3} \right)^{\frac{1}{2}}.$$

Hence
$$2^{-\frac{1}{2}}\beta z = F(k, \arccos \tan \beta \sqrt{u}), \quad \text{where} \quad k = \left( \frac{4 - \lambda^2}{3} \right)^{\frac{1}{2}} / \beta \sqrt{2}. \quad (19)$$

Alternatively
$$\sqrt{u} = \text{tn}(2^{-\frac{1}{2}}\beta z, k)/\beta.$$

Since

$$F(k, \theta) \equiv \int_0^{\sin \theta} \{(1-t^2)(1-k^2t)\}^{-\frac{1}{2}} dt,$$

$$F(1, \theta) = \arg \tanh (\sin \theta) = g d^{-1} \theta.$$

In the important case when $\Psi_0$ is close to 1, so that $\beta^2$ is near $\frac{1}{2}$ and $k$ near 1, we find that (19) passes into

$$\frac{1}{2}z = g d^{-1} (\arctan \sqrt{\frac{1}{2}u}) \quad \text{or} \quad \sinh \frac{1}{2}z = \sqrt{\frac{1}{2}u},$$

with the result that

$$\cosh z = 1 + u = (\Psi - 1)/(\Psi_0 - 1),$$

a conclusion which may be conjectured directly from the differential equation itself.

_Other cases._ Solutions in terms of elliptic functions are obtained in a similar manner after making appropriate substitutions. No special treatment is required in the case of a negative logistic population maintained by immigration in a region of extinction. We merely write $\Psi + 1$ instead of $\Psi$ in the corresponding solution for the positive logistic case.

3-5. _Malthusian populations in two-dimensional habitats._ The fundamental equation expressing the combined effect of diffusion and geometric increase in a habitat throughout which conditions are constant is

$$\frac{\partial \Psi}{\partial t} = \frac{1}{4} a^2 \nabla^2 \Psi + c \Psi(x, y, t). \quad (20)$$

In radially symmetrical cases we may write

$$\frac{\partial \Psi}{\partial t} = \frac{1}{4} a^2 \left( \frac{\partial^2 \Psi}{\partial r^2} + \frac{1}{r} \frac{\partial \Psi}{\partial r} \right) + c \Psi(r, t), \quad (21)$$

where $r^2 = x^2 + y^2$ .

_Case (i)._ A circular region of multiplication enclosed in a zone of _absolute_ extinction:

$$c = \gamma^2 \quad \text{in} \quad 0 \leq r < r_b, \quad 0 \leq t < \infty; \quad \Psi(r_b, t) = 0.$$

To ensure that the solution is finite at the origin we impose the further condition $\frac{\partial}{\partial r} \Psi \Big|_{r=0} = 0$ .

The arbitrary initial state may be expressed as a Bessel series

$$\Psi(r, 0) = \sum_s A_s J_0(r j_s / r_b),$$

where $j_s$ is the $s$ th zero of $J_0$ and $A_s$ is determined in the usual Fourier manner by reason of the orthogonality relation

$$\int_0^1 y J_0(y j_s) J_0(y j_\sigma) dy = 0 \quad (s \neq \sigma).$$

The solution is

$$\Psi(r, t) = \sum_s A_s e^{k_s t} J_0(r j_s / r_b),$$

where

$$k_s = \gamma^2 - \frac{1}{4} a^2 j_s^2 / r_b.$$

Clearly $\Psi \sim A_1 e^{k_1 t} J_0(r j_1 / r_b)$ , tending to 0 or $\infty$ as $r_b \leq j_1 a / 2\gamma$ . It appears again that habitats below a certain critical size, depending on the conditions, are insufficient to maintain a species undergoing unrestricted random dispersal.

_Case (ii)._ Let $(\xi, \eta)$ be the co-ordinates of the place of origin of an individual of the parental generation for which the density function in space is $\Psi(\xi, \eta)$ . Let the probability that a particular one of its offspring originates in the interval $(x \pm \frac{1}{2} dx; y \pm \frac{1}{2} dy)$ be

$$\alpha(x - \xi, y - \eta | a^2) dx dy.$$

Let the probability that such an offspring reaches maturity be $P(x, y)$ . For most simple, small populations $P$ may be taken independent of $\Psi$ . Then if on the average the number of original offspring per parent is $\nu$ we may define a viability function $V(x, y) \equiv \nu P(x, y)$ . The condition for a steady state from generation to generation is the integral equation

$$\Psi(x, y) = V(x, y) \int_{-\infty}^{\infty} \int_{-\infty}^{\infty} \Psi(\xi, \eta) \alpha(x - \xi, y - \eta) |a^2| d\xi d\eta. \quad (22)$$

For the purpose of the present simplified model we take $\alpha$ to be the function

$$\pi^{-1} a^{-2} \exp \{ -[(x - \xi)^2 + (y - \eta)^2] / a^2 \},$$

a choice justified by previous arguments. The function $V(x, y)$ needs to be positive for all values of the variable, and preferably continuous. It will then be seen that the choice $V(x, y) = \exp \{ (b^2 - x^2 - y^2) / v \}$ not only gives a reasonable spatial distribution of viability, but also renders the integral equation tractable. Viability is greatest at the origin, $V_0 = \exp \{ b^2 / v \}$ . The circle $x^2 + y^2 = b^2$ divides the plane into two parts, and in the absence of dispersal, the population inside the circle would increase and the population outside would decline.

The integral equation (22) then has a solution of the form

$$\Psi(\xi, \eta) = A \pi^{-1} \theta^{-1} \exp \{ -(\xi^2 + \eta^2) / \theta \}. \quad (23)$$

Since the double integral is the product of independent integrals and since

$$\int_{-\infty}^{\infty} \alpha(\xi | \theta_1) \alpha(x - \xi | \theta_2) d\xi = \alpha(x | \theta_1 + \theta_2),$$

where $\alpha$ is a normal function, we find on substituting (23) into (22) and equating coefficients that

$$\frac{1}{\theta} = \frac{1}{v} + \frac{1}{\theta + a^2} \quad \text{and} \quad \frac{1}{\theta} = \frac{V_0}{\theta + a^2}, \quad \text{where} \quad \log V_0 = b^2 / v.$$

From these it follows that $b^2 = a^2 V_0 \log V_0 / (V_0 - 1)^2$ .

In the sense indicated earlier, $b$ is the radius of the region of multiplication. Unless this value is attained the population must decline to extinction.

_Case (iii)._ An infinite zone of extinction around a single circular area of multiplication:

$$c = -g^2 \quad \text{in} \quad r_b \leq r < \infty, \quad \Psi(r_b) = B, \quad \Psi(\infty) = 0.$$

The steady state is given by

$$\frac{d^2 \Psi}{dr^2} + \frac{1}{r} \frac{d\Psi}{dr} - m^2 \Psi = 0 \quad \text{where} \quad m = 2g/a. \quad (24)$$

The solution is

$$\Psi(r) = A \int_0^{\infty} e^{-rm \cosh u} u \, du = A K_0(rm),$$

where $K_0$ is the modified Bessel function of the second kind of order zero, and $A = B/K_0(r_b m)$ . It may be noted that $K_0(z) \sim e^{-z}(\pi/2z)^{1/2}$ for large $z$ . When $r_b$ is very large the problem reduces to a linear one (§ 3.3 (i)), the radial component of the R.M.S.D./generation being $a/\sqrt{2}$ .

As a numerical illustration suppose that in the outer zone the population shows a natural tendency to decline at a rate of very nearly 4% per generation ( $g = 0.2$ ). If the radius of the reservoir is 1000 yards and the R.M.S.D./generation 100 yards, then the population density

at a point 1000 yards outside the boundary compared with that at the boundary will be approximately $e^{-2000m} 2000^{-1} / (e^{-1000m} 1000^{-1}) = 0.01295$ , in close agreement with the more accurate value 0.01312 based on the tables of $K_0$ given in Watson (1944).

_Case (iv)._ A circular region of extinction:

$$c = -g^2 \quad \text{in} \quad 0 \leq r \leq r_b, \quad \Psi'(0) = 0, \quad \Psi(r_b) = B.$$

Solution:

$$\Psi(r) = BI_0(rm)/I_0(r_b m),$$

where $I_0$ is the modified Bessel function of the first kind of order zero.

_Case (v)._ An annulus of multiplication in a region of _absolute_ extinction:

$$c = \gamma^2 \quad \text{in} \quad r_a \leq r \leq r_b, \quad \Psi(r_a) = \Psi(r_b) = 0.$$

A stationary non-negative solution exists for every fixed value $r_a$ provided that the value of $r_b$ is made to depend on $r_a$ . If $\mu$ denotes $2\gamma/a$ the required solution is

$$\Psi(r) = A[J_0(\mu r)Y_0(\mu r_a) - J_0(\mu r_a)Y_0(\mu r)],$$

where $Y_0$ is the Bessel function of the second kind (of Weber's type) of order zero.

If $h = r_b/r_a$ , it may be seen that $\mu r_a$ is the first root ( $x_0$ ) of the equation

$$J_0(hx)Y_0(x) - J_0(x)Y_0(hx) = 0. \quad (25)$$

The relation between $r_b/r_a$ and $\mu r_b - \mu r_a$ is that between $h$ and $(h-1)x_0$ , the form in which the zeros of (25) are tabulated in Jahnke & Emde (1945). As $r_a$ increases from zero, $\mu(r_b - r_a)$ moves from $j_{01}$ to $\pi$ , and the problem rapidly degenerates to the linear case.

3-6. _Logistic populations in two-dimensional habitats._ The combined effect of diffusion and logistic growth in radially symmetrical habitats may be expressed by

$$\frac{\partial \Psi}{\partial t} = \gamma^2 \left( \frac{\partial^2 \Psi}{\partial z^2} + \frac{1}{z} \frac{\partial \Psi}{\partial z} + \Psi(1 - \Psi) \right), \quad (26)$$

where $z = 2r\gamma/a$ . In order to describe stationary states we shall require solutions of the non-linear differential equation

$$\frac{d^2 \Psi(z)}{dz^2} + \frac{1}{z} \frac{d\Psi}{dz} + \Psi(1 - \Psi) = 0, \quad (27)$$

especially those that are finite at the origin, in which case

$$\Psi'(0) \equiv \frac{d}{dz} \Psi \Big|_{z=0} = 0. \quad (28)$$

The equation, not being reducible to a Painlevé transcendent, is not free from movable critical points (Valiron, 1945, pp. 293-4). The general march of solutions finite at the origin is shown in Fig. 3. Since $\Psi(1 - \Psi)$ is positive if and only if $0 < \Psi < 1$ , it follows from the differential equation that the turning points of all solutions in the strip $0 < \Psi < 1$ are maxima. Similarly, the only turning points for which $\Psi > 1$ or $\Psi < 0$ are minima.

The spatial distribution of population density is illustrated by $AB$ in the case of a region of extinction, by $CD$ in a circular region of multiplication, and by $EF$ in the case of an annular region of multiplication.

Particular solutions of (27) subject to stated boundary conditions may be computed without much labour by the iterative method outlined in §3.9.

3.7. The function $Q(z; q)$ is defined as the solution of equation (27) subject to condition (28) and the relation $Q(0; q) = q$ . We are concerned here with the real variable only.

If $U(z) \equiv (q - Q(z; q))/q(1 - q)$ , the differential equation satisfied by $U$ is

$$zU'' + U' = z[1 + \lambda U - \frac{1}{4}(1 - \lambda^2)U^2], \quad \text{where } \lambda = 2q - 1. \quad (29)$$

![Figure 3: A graph showing several curves labeled A, B, C, D, E, and F. The vertical axis has tick marks at 0.0, 0.5, and 1.0. The horizontal axis has tick marks at 1, 2, 3, 4, 5, and 6. Curve A is a horizontal line at y=1.0. Curve B starts at (0, 1.0) and increases. Curve C starts at (0, 1.0) and decreases. Curve D starts at (0, 1.0) and decreases, crossing the x-axis at a point marked with an 'x' and labeled 'J_0'. Curve E starts at (0, 0.5) and decreases. Curve F starts at (0, 0.5) and increases. Labels q=1.02, q=0.98, and q=0 are placed near their respective curves.](bafe3c344aef7f6f79dab49c9eca89a9_img.jpg)

Figure 3: A graph showing several curves labeled A, B, C, D, E, and F. The vertical axis has tick marks at 0.0, 0.5, and 1.0. The horizontal axis has tick marks at 1, 2, 3, 4, 5, and 6. Curve A is a horizontal line at y=1.0. Curve B starts at (0, 1.0) and increases. Curve C starts at (0, 1.0) and decreases. Curve D starts at (0, 1.0) and decreases, crossing the x-axis at a point marked with an 'x' and labeled 'J_0'. Curve E starts at (0, 0.5) and decreases. Curve F starts at (0, 0.5) and increases. Labels q=1.02, q=0.98, and q=0 are placed near their respective curves.

Fig. 3

Hence $U$ tends to $1 - J_0(z)$ as $q \rightarrow 0$ and to $J_0(z) - 1$ as $q \rightarrow 1$ . For computational purposes we may therefore seek an approximation to $U$ in the immediate neighbourhood of $z = 0$ in the form

$$U = S(z) - 4q(1 - q)\mathcal{C}(z),$$

where

$$S(z) = \sum_{n=1}^{\infty} \lambda^{n-1} z^{2n} / 2^{2n} 4^2 \dots (2n)^2,$$

may be regarded as a rough approximation

$$\begin{aligned} &= [I_0(z\sqrt{\lambda}) - 1]/\lambda \quad \text{when } \lambda > 0 \\ &= [1 - J_0(z\sqrt{|\lambda|})]/|\lambda| \quad \text{when } \lambda < 0 \\ &= \frac{1}{4}z^2 \quad \text{when } \lambda = 0, \end{aligned}$$

and where

$$\mathcal{C}(z) = \sum_n C_{2n} z^{2n} / 2^{2n} 4^2 \dots (2n)^2$$

is a series of correction terms whose coefficients $C_{2n}$ are to be determined. Only even powers are required, as may be seen either by differentiating (29) an even number of times or by considering the function $\mathcal{U}(z) \equiv U(-z)$ which is a solution of (29) with the same initial conditions. By differentiating $2n + 1$ times by Leibnitz's theorem, making $z = 0$ , and noting

that $U_n \equiv \frac{d^n}{dz^n} U(z) \Big|_{z=0} = 0$ if $n$ is odd, we obtain

$$(2n + 2)U_{2n+2} = (2n + 1) \left[ \lambda U_{2n} - \frac{1}{4}(1 - \lambda^2) \sum_{j=1}^{n-1} \binom{2n}{2j} U_{2j} U_{2n-2j} \right].$$

By substituting

$$A_{2j}/2^2 \dots (2j)^2 \quad \text{for} \quad U_{2j}/(2j)!, \quad \text{where} \quad A_{2j} = \{\lambda^{j-1} - (1-\lambda^2)C_{2j}\},$$

we find

$$C_{2n+2} = \lambda C_{2n} + \frac{1}{4} \sum_{j=1}^{n-1} \binom{n}{j}^2 A_{2j} A_{2n-2j}.$$

Thereby we obtain in succession:

$$C_2 = C_4 = 0, \quad C_6 = 1, \quad C_8 = 11\lambda/2, \quad C_{10} = (61\lambda^2 - 16)/2,$$

$$C_{12} = \lambda(847\lambda^2 - 507)/4, \quad C_{14} = (3820\lambda^4 - 3677\lambda^2 + 488)/2,$$

$$C_{16} = \lambda(176,245\lambda^4 - 234,718\lambda^2 + 67,857)/8,$$

$$C_{18} = (2,536,967\lambda^6 - 4,317,594\lambda^4 + 1,978,563\lambda^2 - 162,816)/8.$$

Computed values of $U/z^2$ are given in Table 1 for equidistant values of $q$ and of $z^2$ . With this arrangement interpolation can be carried out reasonably safely.

Table 1. $[q - Q(z; q)]/z^2 q(1 - q)$

| $\begin{array}{c} q \\ z^2 \end{array}$ | 0-0    | 0-1    | 0-2    | 0-3    | 0-4    | 0-5    | 0-6    | 0-7    | 0-8    | 0-9    | 1-0    |
| --------------------------------------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| 0                                       | 0-2500 | 0-2500 | 0-2500 | 0-2500 | 0-2500 | 0-2500 | 0-2500 | 0-2500 | 0-2500 | 0-2500 | 0-2500 |
| 1                                       | 0-2348 | 0-2376 | 0-2405 | 0-2435 | 0-2466 | 0-2496 | 0-2528 | 0-2559 | 0-2592 | 0-2626 | 0-2661 |
| 2                                       | 0-2204 | 0-2255 | 0-2309 | 0-2364 | 0-2423 | 0-2483 | 0-2546 | 0-2613 | 0-2682 | 0-2754 | 0-2831 |
| 3                                       | 0-2068 | 0-2138 | 0-2211 | 0-2289 | 0-2373 | 0-2461 | 0-2556 | 0-2658 | 0-2767 | 0-2884 | 0-3010 |
| 4                                       | 0-1940 | 0-2023 | 0-2113 | 0-2211 | 0-2317 | 0-2432 | 0-2558 | 0-2696 | 0-2847 | 0-3014 | 0-3199 |
| 5                                       | 0-1819 | 0-1913 | 0-2016 | 0-2130 | 0-2255 | 0-2395 | 0-2551 | 0-2725 | 0-2922 | 0-3145 | 0-3399 |
| 6                                       | 0-1705 | 0-1806 | 0-1919 | 0-2046 | 0-2189 | 0-2351 | 0-2535 | 0-2746 | 0-2990 | 0-3275 | 0-3609 |
| 7                                       | 0-1597 | 0-1704 | 0-1824 | 0-1961 | 0-2118 | 0-2300 | 0-2511 | 0-2758 | 0-3052 | 0-3404 | 0-3831 |
| 8                                       | 0-1496 | 0-1605 | 0-1731 | 0-1876 | 0-2044 | 0-2243 | 0-2479 | 0-2761 | 0-3105 | 0-3530 | 0-4065 |
| 9                                       | 0-1400 | 0-1511 | 0-1639 | 0-1790 | 0-1969 | 0-2181 | 0-2439 | 0-2759 | 0-3150 | 0-3654 | 0-4312 |

3-8. _The stability of stationary states._ In the case of Malthusian populations with positive parameter (§§3-3 (iii), 3-5 (i)), it was apparent that the stationary state was an unstable one. Though we were able to draw valid conclusions with regard to the critical size of a habitat for a population on the point of extinction, the model is inadequate in that it does not provide a stable stationary state for a population which is safely established. The assumption of logistic growth is free from this objection.

For let $\Omega$ be a solution of (27) subject to

$$\Omega(z_a) = A, \quad \Omega(z_b) = B \quad (0 < z_a < z_b),$$

and let $\Psi(z, t)$ satisfy (26) subject to

$$\Psi(z_a, t) = A, \quad \Psi(z_b, t) = B.$$

(The proof for the special case where the conditions at $z_a = 0$ are $\Omega' = \frac{\partial}{\partial z} \Psi = 0$ differs only in trivial details and is omitted.)

Then from our knowledge of the physical situation we should expect $\Psi \rightarrow \Omega$ as $t \rightarrow \infty$ . Provided that the necessary biological condition holds, that $\Omega(z) \geq 0$ in $z_a \leq z \leq z_b$ (though not zero everywhere), it can at least be shown that $\Omega$ describes a stable equilibrium.

The function $\Delta(z, t) \equiv \Psi(z, t) - \Omega(z)$ satisfies

$$\frac{1}{\gamma^2} \frac{\partial \Delta}{\partial t} = \frac{\partial^2 \Delta}{\partial z^2} + \frac{1}{z} \frac{\partial \Delta}{\partial z} + \Delta(1 - 2\Omega - \Delta). \quad (30)$$

In dealing with questions of stability we need only consider such $\Delta(z, 0)$ as are infinitesimal variations of $\Omega$ . So long as $\Delta$ remains small, equation (30) remains effectively

$$\frac{1}{\gamma^2} \frac{\partial \Delta}{\partial t} = \frac{\partial^2 \Delta}{\partial z^2} + \frac{1}{z} \frac{\partial \Delta}{\partial z} + \Delta(1 - 2\Omega), \quad (31)$$

with the conditions

$$\Delta(z_a, t) = \Delta(z_b, t) = 0 \quad (0 \leq t < \infty).$$

We are therefore led to consider solutions of

$$\frac{d^2 f}{dz^2} + \frac{1}{z} \frac{df}{dz} + (\Lambda + 1 - 2\Omega)f = 0 \quad (32)$$

which satisfy $f(z_a) = f(z_b) = 0$ , with $\Omega(z)$ as given. The Sturm-Liouville theorems are immediately applicable. Reduction to the standard form adopted by Titchmarsh (1946) may be brought about by the substitution $v = f\sqrt{z}$ , though in this case there are advantages in following Ince (1927) and expressing (32) as

$$\frac{d}{dz}(zf') + z(\Lambda + 1 - 2\Omega)f = 0. \quad (33)$$

The values of $\Lambda$ for which solutions are possible will be denoted by $\Lambda_i$ ( $i = 0, 1, 2, \dots$ ) and the corresponding solutions by $f_i(z)$ , the suffix being the number of zeros between $z_a$ and $z_b$ . We now prove that $\Lambda_0$ is positive.

By multiplying (33) by $\Omega$ , substituting $f_0$ for $f$ , and integrating we find

$$[z\Omega f_0']_{z_a}^{z_b} - \int_{z_a}^{z_b} z\Omega f_0' dz + (\Lambda_0 + 1) \int_{z_a}^{z_b} z f_0' \Omega dz - 2 \int_{z_a}^{z_b} z f_0 \Omega^2 dz = 0.$$

By subtracting from this a similar relationship obtained in the corresponding manner from (27) with $\Omega$ as the dependent variable, we then have

$$\Lambda_0 \int_{z_a}^{z_b} z f_0 \Omega dz = \int_{z_a}^{z_b} z f_0 \Omega^2 dz - [z\Omega f_0']_{z_a}^{z_b}. \quad (34)$$

The sign of $f_0'(z_a)$ = minus sign of $f_0'(z_b)$ = sign of both integrands, provided that $\Omega$ is positive throughout $(z_a, z_b)$ . Hence

$$\Lambda_0 \geq \int_{z_a}^{z_b} z f_0 \Omega^2 dz \bigg/ \int_{z_a}^{z_b} z f_0 \Omega dz$$

and is positive. By Sturm's oscillation theorems, $\Lambda_0 < \Lambda_1 < \Lambda_2 \dots$ , so that all characteristic numbers are positive.

From (33) we have

$$f_j \frac{d}{dz}(zf_i') + z(\Lambda_i + 1 - 2\Omega)f_j f_i = 0$$

and a similar relation with $i$ and $j$ interchanged. On integrating (the first term by parts) and subtracting, we find

$$(\Lambda_i - \Lambda_j) \int_{z_a}^{z_b} z f_i f_j dz = 0. \quad (35)$$

The fundamental set of solutions constitute an orthogonal system, and systems of the above kind are known to be closed (Ince, 1927). Any arbitrary function such as $\Delta(z, 0)$ has the

formal development $\Delta = \sum_i A_i f_i(z)$ , where the coefficients are given in the usual Fourier manner by

$$A_i = \int_{z_a}^{z_b} z \Delta(z) f_i(z) dz \int_{z_a}^{z_b} z f_i^2(z) dz.$$

If $\Delta(z)$ is integrable over $(z_a, z_b)$ and of bounded variation in the neighbourhood of $z = \zeta$ , it may be shown that the Sturm-Liouville development given above converges to

$$\frac{1}{2}[\Delta(\zeta+0) + \Delta(\zeta-0)] \quad \text{at } z = \zeta.$$

In problems of the type being discussed at present it is, however, permissible to assume the less general condition that $\Delta(z)$ has a continuous second derivative, and in this case the series is absolutely and uniformly convergent in $(z_a, z_b)$ (Ince, 1927).

It now follows that the solution of (31) is

$$\Delta(z, t) = \sum_{i=0}^{\infty} A_i e^{-\Lambda_i t} f_i(z).$$

As $t \rightarrow \infty$ , $\Delta \rightarrow 0$ , since all $\Lambda_i > 0$ .

3.9. _An iterative method._ Consider, for example, the equation

$$\frac{d}{dz}(z\Psi') + z c_1(z) \Psi - z c_2(z) \Psi^2 = 0.$$

This may be written

$$\Psi'(Z) = \Psi'(b) + b\Psi''(b) \log(Z/b) - \int_b^Z \frac{dX}{X} \int_b^X (z c_1 \Psi - z c_2 \Psi^2) dz. \quad (36)$$

The limiting form of this equation as $b \rightarrow 0$ provided that $\Psi'(b)$ remains finite is

$$\Psi(Z) = \Psi(0) - \int_0^Z \frac{dX}{X} \int_0^X (z c_1 \Psi - z c_2 \Psi^2) dz. \quad (37)$$

If approximate values of $\Psi'(z)$ are substituted on the right-hand side of (36) or (37) and the integration performed numerically, we obtain greatly improved values on the left. It is an easy matter to continue the solution step by step obtaining rough values as required by simple graphical extrapolation. Because of the remarkable rapidity of convergence it is soon found unnecessary to repeat the calculations for the earlier values (which automatically reproduce themselves).

For numerical illustration let $b = 0$ , $\Psi'(0) = 0$ , $\Psi(0) = 0.5$ , $c_1(z) = c_2(z) = 1$ , so that the equation is

$$0.5 - \Psi(Z) = \int_0^Z \frac{dX}{X} \int_0^X z \Psi(1 - \Psi) dz.$$

The initial rough values are arranged in column (ii) of Table 2. Using intervals of $z$ no smaller than $\frac{1}{2}$ , and only the elementary integration formulae:

$$\begin{aligned} \int_0^h f(x) dx &= \frac{1}{2}h[5f(0) + 8f(h) - f(2h)], \\ \int_{a-h}^{a+h} f(x) dx &= \frac{1}{3}h[f(a-h) + 4f(a) + f(a+h)], \end{aligned}$$

we find that a single application of the process reduces the sum of the squares of the errors to less than $1/800$ its original value.

The method can be applied even if the $c$ 's are variable with finite discontinuities at a finite number of points in $(b_1, b_2)$ provided that the interval of argument employed is not unreasonably large. Given $\Psi(b_1)$ and $\Psi'(b_1)$ new values of $\Psi(z)$ can be established progressively along $(b_1, b_2)$ . Given $\Psi(b_1)$ and $\Psi(b_2)$ , however, it appears necessary to plot several integral curves radiating from the point $(b_1, \Psi(b_1))$ each with an assumed value of $\Psi'(b_1)$ . After each trial this value is systematically adjusted until the condition at $z = b_2$ is satisfied.

Table 2

| (i)<br>$z$ | (ii)<br>approx.<br>$\Psi'$ | (iii)<br>$z\Psi(1-\Psi)$ | (iv)<br>$\int_0^x$<br>col. (iii) | (v)<br>$\frac{1}{X}$<br>col. (iv) | (vi)<br>$\int_0^z$<br>col. (v) | (vii)<br>$0.5 - (vi)$ | (viii)<br>$\Psi'$ by<br>series |
| ---------- | -------------------------- | ------------------------ | -------------------------------- | --------------------------------- | ------------------------------ | --------------------- | ------------------------------ |
| 0.0        | 0.50                       | 0.00000                  | 0.000000                         | 0.000000                          | 0.000000                       | 0.50000               | 0.50000                        |
| 0.5        | 0.48                       | 0.12480                  | 0.031333                         | 0.062666                          | 0.015711                       | 0.48429               | 0.48438                        |
| 1.0        | 0.44                       | 0.24640                  | 0.124267                         | 0.124267                          | 0.062489                       | 0.43751               | 0.43761                        |
| 1.5        | 0.36                       | 0.34560                  | 0.274000                         | 0.182667                          | 0.139445                       | 0.36056               | 0.36060                        |
| 2.0        | 0.26                       | 0.38480                  | 0.459867                         | 0.229935                          | 0.243301                       | 0.25670               | 0.25681                        |
| 2.5        | 0.13                       | 0.28275                  | 0.635258                         | 0.254103                          | 0.365530                       | 0.13447               | 0.13462                        |
| 3.0        | 0.01                       | 0.02970                  | 0.717450                         | 0.239150                          | 0.490884                       | 0.00912               | 0.00924                        |

3.10. _A more general problem._ When the vital coefficients vary from place to place in an entirely arbitrary manner the equation we have to consider is

$$\frac{\partial \Psi'}{\partial t} = \frac{1}{2}a^2\nabla^2\Psi' + c_1(x, y)\Psi' - c_2(x, y)\Psi^2. \quad (38)$$

Orthodox analytical methods appear inadequate, even in one-dimensional or radially symmetrical cases. In these cases an easy extension of the argument of §3.8 shows that a sufficient but not necessary condition for the stability of solutions is that $c_2 > 0$ in the habitat considered. Because of this, simple methods or numerical solution akin to 'relaxation' were tried out for such cases, but, because of the ultimate slowness of convergence, were abandoned in favour of the method of §3.9.

3.11. _Conditions at a common boundary._ In the present treatment $\Psi'$ is regarded as continuous, and the $c$ 's as continuous except at certain points. But this is only a convenient abstraction. In nature there are discontinuities almost everywhere (see Denjoy, 1937, p. 8), and it might be thought theoretically more desirable to construct our analytical model with functions of a more general nature. The scientist, however, is not so much concerned with the behaviour of $\Psi'$ and $c$ at a particular point as in their mean value in a small neighbourhood of that point.

Consider the situation at the point $x = b$ in a linear habitat where the 'diffusivity' is uniform throughout but where the vital coefficients in $b' \leq x < b$ differ from those in $b < x \leq b'$ . (The case where one subinterval is a region of absolute extinction is excluded, and this is best treated as a limiting case with $c_1$ tending to $-\infty$ .) An appeal to our fundamental assumptions will show that unless $\Psi'$ is the same at $b-0$ and $b+0$ , the rate of population flow across the boundary would be infinitely great, proceeding in such a direction as to restore the continuity of $\Psi'$ . Similarly, unless $\partial\Psi'/\partial x$ is the same at $b-0$ as at $b+0$ the rate of change of density in an infinitesimally small neighbourhood of $b$ would be infinitely great, proceeding in such a way as to equalize the derivatives at $b-0$ and $b+0$ . A similar argument holds in a radially symmetrical habitat or the more general two-dimensional one.

When employing the iterative method of §3.9 it is not necessary to define the vital coefficients at $x = b$ unless $b$ coincides with a tabular value of the argument. In such a case it is desirable to define $c(b) = \frac{1}{2}[c(b+0) + c(b-0)]$ . The continuity of $c$ is tacitly implied in the use of formulae of numerical integration.

## 4. REPRODUCTIVE CAPACITY AND POPULATION DENSITY

4.1. _A law of population growth._ Strictly the logistic law is applicable only to populations which are continuous in time. It will be shown that where competition is most marked among seedlings distributed at random, a somewhat different law holds for annual plants with the analogue of the logistic law as a limiting case.

The following symbols are used:

$H$ is a coefficient denoting the suitability of the habitat as a whole, and is resolvable into separate components. For example, $H = Wsp/\Xi$ , where

$W$ is the number of spots of ground suitable in nature and size to support one plant of the species concerned to maturity. Such a spot will be termed a cell. Cells may be isolated or adjacent in groups of two or more. In the present simplified treatment, all cells are regarded as of the same surface area, namely, one unit.

$\Xi$ is an arbitrary area constructed to include all the cells. It is assumed that this area is insulated in the sense that it receives no seeds from without.

$p$ denotes the proportion of seeds which actually fall in $\Xi$ . It is assumed that the probability distribution of the seeds is even throughout $\Xi$ .

$s$ is the probability that a 'seeded cell' rears a seedling to maturity.

$\Gamma$ denotes reproductive capacity, the number of fertile seeds produced on the average per plant.

$\chi$ denotes relative density, defined here as the ratio of actual population density to the hypothetical maximum that the habitat could support, were every cell seeded. That is, $\chi = N/Ws$ , where $N$ is the actual population number.

In the interests of completeness it might be thought desirable to introduce more ecological factors than are considered here. In most cases it will be found that the mathematical form of the final result is unchanged, particularly when the appropriate modifications are incorporated into the definitions.

The probability distribution of the number of seeds per cell will be Poissonian with parameter $N\Gamma p/\Xi = N\Gamma H/Ws = \Gamma H\chi$ . The proportion of cells with at least one seed is then $1 - e^{-\Gamma H\chi}$ (neglecting minor irregularities due to sampling). By reason of the definition of $\chi$ this expression is the relative density of the resulting population. Using suffixes to distinguish between the values of $\chi$ in successive generations, we then have the law

$$\chi_{n+1} = 1 - e^{-\Gamma H\chi_n}. \quad (39)$$

The ultimate stable value $\chi_\infty$ satisfies the equation

$$\log(1 - \chi) + \Gamma H\chi = 0. \quad (40)$$

Typical growth 'curves' are illustrated in Fig. 4. From (40) it will be seen that as $\chi \rightarrow 1$ from lower values $\Gamma H \sim \log \frac{1}{1-\chi} \rightarrow \infty$ , so that when $\chi$ is large a very considerable increase in reproductive capacity is required to bring about a perceptible increase in the population.

4.2. _Further applications._ The relation between the area 'covered' by a randomly moving insect and the distance traversed by that insect (Nicholson & Bailey, 1935) is closely analogous with the relation between area 'seeded' and the number of seeds produced by an annual plant. In many species of insect the population one year depends on the number of places suitable for oviposition encountered by the adult population of the previous year. In the simplest cases of this type, it is to be expected that relation (39) will be applicable.

![Figure 4: A scatter plot showing Relative density (Y-axis, 0 to 1.0) versus Generations (X-axis, 0 to 15). Two data series are plotted: one for ΓH = 5 (upper curve) and one for ΓH = 2 (lower curve). Both curves show an initial rapid increase in relative density, followed by a plateau. The ΓH = 5 curve reaches a plateau near 1.0, while the ΓH = 2 curve reaches a plateau near 0.8.](9260ae281f6b6470331f4a0f82dbc2b1_img.jpg)

| Generations | Relative density (ΓH = 5) | Relative density (ΓH = 2) |
| ----------- | ------------------------- | ------------------------- |
| 0           | 0.00                      | 0.00                      |
| 1           | 0.10                      | 0.05                      |
| 2           | 0.45                      | 0.10                      |
| 3           | 0.90                      | 0.15                      |
| 4           | 1.00                      | 0.20                      |
| 5           | 1.00                      | 0.30                      |
| 6           | 1.00                      | 0.40                      |
| 7           | 1.00                      | 0.50                      |
| 8           | 1.00                      | 0.60                      |
| 9           | 1.00                      | 0.70                      |
| 10          | 1.00                      | 0.75                      |
| 11          | 1.00                      | 0.78                      |
| 12          | 1.00                      | 0.80                      |
| 13          | 1.00                      | 0.82                      |
| 14          | 1.00                      | 0.83                      |
| 15          | 1.00                      | 0.83                      |

Figure 4: A scatter plot showing Relative density (Y-axis, 0 to 1.0) versus Generations (X-axis, 0 to 15). Two data series are plotted: one for ΓH = 5 (upper curve) and one for ΓH = 2 (lower curve). Both curves show an initial rapid increase in relative density, followed by a plateau. The ΓH = 5 curve reaches a plateau near 1.0, while the ΓH = 2 curve reaches a plateau near 0.8.

Fig. 4

Somewhat similar but more elaborate relationships have been deduced (see Jordan & Burrows, 1945; Zinsser & Wilson, 1932) in connexion with the dissemination of infectious diseases.

4.3. _Discrete logistic growth._ The recurrence relationship (39) also arises in the solution of a problem in evolutionary genetics (Skellam, 1948). Provided that $\Gamma H \chi$ is small we have as a good approximation

$$\chi_{n+1} = 1 - \frac{1 - \frac{1}{2}\Gamma H \chi_n}{1 + \frac{1}{2}\Gamma H \chi_n}. \quad (41)$$

Since $\chi_\infty = 2(\Gamma H - 1)/\Gamma H$ we may express this approximation as

$$\chi_{n+1} - \chi_n = \frac{1}{2}\chi_{n+1}(\chi_\infty - \chi_n),$$

corresponding to the differential equation (7a). The finite difference equation is of the Ricatti type (Milne-Thomson, 1933) and has the solution

$$\chi_n = \frac{\chi_0 \chi_\infty}{\chi_0 + (\chi_\infty - \chi_0)(\Gamma H)^{-n}}. \quad (42)$$

This expression is in fact the logistic law for a discrete variable. For writing $N_n/N_\infty = \chi_n/\chi_\infty$ , $c = \log \Gamma H$ , and denoting the independent variable by $t$ with its origin at the centre of symmetry, we obtain the standard form $N(t) = N(\infty)/(1 + e^{-ct})$ .

A simple guide to the values of $\Gamma H$ for which (41) is a fair approximation to (39) is afforded by the comparison of the upper asymptotes in the two cases for the same fixed values of $\Gamma H$ , as shown in Table 3.

It will be seen that $\chi_\infty$ is an increasing function of $H$ and therefore of $W$ , the number of suitable spots in $\Xi$ . It therefore appears, other things being equal, that in the richer habitats

a greater proportion of the available cells are actually utilized. The inference may well be extended to perennial populations.

Table 3

| $\Gamma H = 1.0258$ |        | 1.0536 | 1.1157 | 1.277 | 2.0   |
| ------------------- | ------ | ------ | ------ | ----- | ----- |
| By (40)             | 0.0500 | 0.1000 | 0.2000 | 0.400 | 0.797 |
| By (41)             | 0.0504 | 0.1017 | 0.2074 | 0.433 | 1.000 |

4.4. _Two species in competition._ The classical case of two closely similar logistic species competing for the same food has been studied by Gause (1935) and Volterra (1931). The case we shall consider here is that of two closely related species of annual plant, $S$ and $S'$ , competing in the same habitat. In order to investigate the extent to which a disadvantage in direct competition may be offset by a superiority in reproductive capacity, we shall assume the extreme condition that individual $S'$ seedlings always fail to establish themselves in immediate competition with $S$ seedlings (for example, the $S$ seed may germinate earlier). All other ecological factors will be regarded as the same for both populations.

Under these conditions the $S$ population is not adversely affected by the presence of $S'$ , and we may write

$$\Gamma H\chi + \log(1 - \chi) = 0. \quad (43)$$

The number of cells unoccupied by $S$ in the seedling stage is then $W(1 - \chi)$ , and these are the only ones available to $S'$ .

It follows as in (4.2) that for an equilibrium

$$N' = sW(1 - \chi)[1 - e^{-N'T'p/\Xi}]. \quad (44)$$

In order that the unit in terms of which we express the relative population density of $S'$ is independent of $\chi$ , we shall denote $N'/sW$ by $\chi'_0$ . Equation (44) then becomes

$$\chi'_0 = (1 - \chi)[1 - e^{-\Gamma'\chi'_0 H}]. \quad (45)$$

Hence, from (43) and (45),

$$\Gamma'/\Gamma = \chi \log\left(1 - \frac{\chi'_0}{1 - \chi}\right) \bigg/ \chi'_0 \log(1 - \chi). \quad (46)$$

If now we allow $\chi'_0 \rightarrow 0$ we find that $\Gamma'/\Gamma \rightarrow -\chi/(1 - \chi) \log(1 - \chi)$ . This will be termed the critical value of $\Gamma'/\Gamma$ . Unless it is exceeded $S'$ cannot coexist with $S$ . When $S$ is not dense it

Table 4a

| $\chi$                    | 0.0+ | 0.2  | 0.4  | 0.6  | 0.8  | 0.9  | 0.99 |
| ------------------------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Critical $\Gamma'/\Gamma$ | 1.0  | 1.12 | 1.31 | 1.64 | 2.49 | 3.91 | 21.5 |

Table 4b

| $\chi \backslash \chi'_0$ | 0+    | 0.1   | 0.2   | 0.3   | 0.4   | 0.5      | 0.6   |
| ------------------------- | ----- | ----- | ----- | ----- | ----- | -------- | ----- |
| 0.1                       | 1.055 | 1.118 | 1.193 | 1.283 | 1.395 | 1.539    | 1.738 |
| 0.5                       | 1.443 | 1.610 | 1.842 | 2.20  | 2.90  | $\infty$ | —     |

is possible for $S'$ to survive (despite its extreme inferiority in direct competition) with only a slightly superior reproductive capacity, but when $S$ is very dense, it is impossible for $S'$ to survive unless its reproductive capacity is many times greater than that of $S$ . In the case of very small populations the 'safety level' of $\Gamma'/\Gamma$ will be somewhat greater than the critical value, because of the danger of random extinction. Table 4a gives the critical values of $\Gamma'/\Gamma$ for various values of $\chi$ . Table 4b gives the values of $\Gamma'/\Gamma$ required to maintain the $S'$ population at various levels in the two cases $\chi = 0.1$ and $0.5$ .

4.5. _Two species and two habitats._ As a simple illustration of the application of these relations consider two habitats with coefficients $H_1 = 0.001$ and $H_2 = 0.01$ , the same for both species, and let $\Gamma = 400$ and $\Gamma' = 2000$ . The seeds of $S'$ , being more numerous, might well have smaller food reserves. Whatever the cause it is assumed as before that $S'$ seedlings do not establish themselves in _immediate_ competition with $S$ seedlings.

Since $\Gamma H_1 = 0.4 < 1$ , $S$ cannot survive in the first habitat but does so in the second with $\chi = 0.9803$ . Hence $-\chi/(1-\chi) \log(1-\chi) = 12.7 > \Gamma'/\Gamma = 5$ . As a result $S'$ cannot compete successfully in the second habitat though in the first it appears safely established with $\chi' = 0.797$ .

In ecological terms we could say that though the requirements of both species are the same, the species with the greater reproductive capacity is better suited to the poorer habitat, and the species with the greater ability to establish itself against competition at the seedling stage is better adapted to life in the richer habitat.

## 5. BIOLOGICAL DISCUSSION

1. The analytical model developed here assumes that dispersal is effectively at random. This is at least approximately true for large numbers of terrestrial plants and animals. The behaviour patterns of certain animals may be such, however, as to tend to lead them to more favourable conditions. To deal adequately with these cases it will be necessary to introduce a further complication into the theoretical model somewhat analogous to gravitational attraction. Nevertheless, in most instances the range of an animal's perception is small compared with its powers of dispersal, and even the more intelligent may not discriminate between two parts of a habitat differing considerably in their effect on survival. Local irregularities in the character of the environment act as stimuli initiating repeated tactic displacements, the ultimate cumulative effect of which is scarcely distinguishable from a blind randomness.

2. If a population is initially located at a centre, spreads as with a Brownian motion, and undergoes unrestricted growth, the rate of radial expansion of its contours is approximately constant (see equations 5, 5a). A similar law applies to the flow of a gene, but here it should be noted that $\gamma^2$ for a new advantageous mutation will almost always be very small. The oft-repeated statement that a new advantageous gene spreads through the population replacing the former wild-type allelomorph is probably true (if no more than a reasonable period of time is allotted) only in those cases where the powers of dispersal are considerable in relation to the area occupied. In assessing the roles played by various processes in bringing about speciation, it might be borne in mind that fragmentation of the distribution area is by no means a necessary condition for different accumulations of genetic diversity to arise in the same species in different parts of a comparatively uniform habitat, and ecological adaptation can always occur when the rates of gene flow are insufficient to dissipate the genetic advances being made.

3. Just as the area/volume ratio is an important concept in connexion with continuance of metabolic processes in small organisms, so is the perimeter/area concept (or some equivalent relationship) important in connexion with the survival of a community of mobile individuals. Though little is known from the study of field data concerning the laws which connect the distribution in space of the density of an annual population with its powers of dispersal, rates of growth and the habitat conditions, it is possible to conjecture the nature of this relationship in simple cases. The treatment of §3 shows that if an isolated terrestrial habitat is less than a certain critical size the population cannot survive. If the habitat is slightly greater than this the surface which expresses the density at all points is roughly dome-shaped, and for very large habitats this surface has the form of a plateau.

4. The logistic law of population growth is often compared with that of autocatalysis (D'Arcy Thompson, 1942) and the inference made that population size is limited by the available food supply. In the present paper it is shown from spatial considerations alone that many populations which are discrete in time can be expected to satisfy the logistic law—at least as a close approximation.

5. The problem of the relationship between the reproductive capacity of plants and their habitat conditions has been studied very thoroughly by Salisbury (1942), but it is by no means certain that the thesis he adopts (pp. 159, 160, 231) is entirely tenable. The analytical approach of §§4.3–4.5, though no doubt over-simplified, provides us immediately with a possible explanation of the well-known paradox that certain species flourish only in unpromising situations, and might be developed and applied with advantage to throw light on related problems in this confused and bewildering subject.

## REFERENCES

- BROWNLEE, J. (1911). _Proc. R. Soc. Edinb._ **31**, 262.  
  CHANDRASEKHAR, S. (1943). _Rev. Mod. Phys._ **15**, 1–89.  
  DE GEER, G. (1910). _Int. Geol. Congr._ Stockholm.  
  DENJOY, A. (1937). _Théorie des Fonctions de Variables Réelles_, **1**. Paris: Hermann.  
  FISHER, R. A. (1922). _Proc. R. Soc. Edinb._ **42**, 327.  
  FISHER, R. A. (1930). _The Genetical Theory of Natural Selection_. Oxford: Clarendon Press.  
  FISHER, R. A. (1937). _Ann. Eugen._, _Lond._, **7**, 355–69.  
  GAUSE, G. F. (1935). _Vérifications expérimentales de la théorie mathématique de la lutte pour la vie_. Paris: Hermann.  
  GODWIN, H. (1934). _New Phytol._ **33**.  
  HALDANE, J. B. S. (1932). _The Causes of Evolution_. Appendix. London: Longmans, Green.  
  INCE, E. L. (1927). _Ordinary Differential Equations_. London: Longmans, Green.  
  JAHNKE, E. & EMDE, F. (1945). _Tables of Functions_, 4th ed., p. 205. New York: Dover Publications.  
  JEANS, J. (1921). _The Dynamical Theory of Gases_. Cambridge University Press.  
  JORDAN, E. O. & BURROWS, W. (1945). _Textbook of Bacteriology_, 14th ed. Philadelphia: Saunders.  
  KENDALL, D. G. (1948). _Proc. Camb. Phil. Soc._ **44**, 591–4.  
  KLUYVER, J. C. (1905). _Proc. K. Akad. Vet. Amat._ 25 Oct., pp. 341–50.  
  KOSTITZIN, V. A. (1939). _Mathematical Biology_. London: Harrap.  
  LEGENDRE, A. M. (1825). _Traité des Fonctions Elliptiques_, **2**. Paris. Tables reissued with an Introduction by K. Pearson (1934). Cambridge University Press.  
  LOTKA, A. J. (1925). _Elements of Physical Biology_. Baltimore.  
  LOTKA, A. J. (1939). _Théorie Analytique des Associations Biologiques_, Part II. Paris: Hermann.  
  MAXWELL, J. C. (1860). _Phil. Mag._ [4], **19**, 31.  
  MILNE-THOMSON, L. M. (1933). _The Calculus of Finite Differences_. London: Macmillan.  
  NICHOLSON, A. J. & BAILEY, V. A. (1935). _Proc. Zool. Soc. Lond._, pp. 551–98.  
  PEARSON, K. (1906). Mathematical Contributions to the Theory of Evolution, XV. _Drapers' Company Research Memoirs_.  
  RASHEVSKY, N. (1948). _Mathematical Biophysics_. University of Chicago Press.

- RAYLEIGH, LORD (1919). _Phil. Mag._ [6], **37**, 321.
- REID, C. (1899). _The Origin of the British Flora_. London: Dulau.
- SALISBURY, E. J. (1942). _The Reproductive Capacity of Plants_. London: Bell.
- SKELLAM, J. G. (1948). _Proc. Camb. Phil. Soc._ **45**, 364.
- TANSLEY, A. G. (1939). _The British Islands and their Vegetation_. Cambridge University Press.
- THOMPSON, D'ARCY (1942). _Growth and Form_. Cambridge University Press.
- TITCHMARSH, E. C. (1946). _Eigenfunction Expansions associated with Second-Order Differential Equations_. Oxford: Clarendon Press.
- ULBRICH, J. (1930). _Die Bisamratte_. Dresden: Heinrich.
- USPENSKY, J. V. (1937). _Introduction to Mathematical Probability_. New York: McGraw-Hill.
- VALIRON, G. (1945). _Equations Fonctionnelles_. Paris: Masson.
- VOLTERRA, V. (1931). _Leçons sur la Théorie Mathématique de la Lutte pour la Vie_. Paris: Gauthier-Villars.
- WATSON, G. N. (1944). _Treatise on Bessel Functions_. Cambridge University Press.
- WATT, A. S. (1919). On the Causes of Failure of Natural Vegetation in British Oakwoods. _J. Ecol._ **7** (nos. 3 and 4), 173.
- WRIGHT, S. (1931). _Genetics_, **16**, 97–159.
- WRIGHT, W. B. (1937). _The Quaternary Ice Age_. London: Macmillan.
- ZINSSER, H. & WILSON, E. B. (1932). _J. Prev. Med._ **6**, 497–514.
