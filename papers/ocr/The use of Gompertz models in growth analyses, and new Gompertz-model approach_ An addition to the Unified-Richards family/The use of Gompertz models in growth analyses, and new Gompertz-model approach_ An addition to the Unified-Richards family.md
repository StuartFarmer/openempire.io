## RESEARCH ARTICLE

# The use of Gompertz models in growth analyses, and new Gompertz-model approach: An addition to the Unified-Richards family

Kathleen M. C. Tjørve\*, Even Tjørve

Inland Norway University of Applied Sciences, Elverum, Norway

\* [kathy.tjorve@inn.no](mailto:kathy.tjorve@inn.no)

![Check for updates icon](0538daaa5583c23e17db3a12f2281a55_img.jpg)

Check for updates icon

## Abstract

The Gompertz model is well known and widely used in many aspects of biology. It has been frequently used to describe the growth of animals and plants, as well as the number or volume of bacteria and cancer cells. Numerous parametrisations and re-parametrisations of varying usefulness are found in the literature, whereof the Gompertz-Laird is one of the more commonly used. Here, we review, present, and discuss the many re-parametrisations and some parameterisations of the Gompertz model, which we divide into $T_1$ (type I)- and $W_0$ (type II)-forms. In the $W_0$ -form a starting-point parameter, meaning birth or hatching value ( $W_0$ ), replaces the inflection-time parameter ( $T_1$ ). We also propose new “unified” versions (U-versions) of both the traditional $T_1$ -form and a simplified $W_0$ -form. In these, the growth-rate constant represents the relative growth rate instead of merely an unspecified growth coefficient. We also present U-versions where the growth-rate parameters return absolute growth rate (instead of relative). The new U-Gompertz models are special cases of the Unified-Richards (U-Richards) model and thus belong to the Richards family of U-models. As U-models, they have a set of parameters, which are comparable across models in the family, without conversion equations. The improvements are simple, and may seem trivial, but are of great importance to those who study organismal growth, as the two new U-Gompertz forms give easy and fast access to all shape parameters needed for describing most types of growth following the shape of the Gompertz model.

###### OPEN ACCESS

**Citation:** Tjørve KMC, Tjørve E (2017) The use of Gompertz models in growth analyses, and new Gompertz-model approach: An addition to the Unified-Richards family. PLoS ONE 12(6): e0178691. <https://doi.org/10.1371/journal.pone.0178691>

**Editor:** Roeland M.H. Merks, Centrum Wiskunde & Informatica (CWI) & Netherlands Institute for Systems Biology, NETHERLANDS

**Received:** April 26, 2016

**Accepted:** May 17, 2017

**Published:** June 5, 2017

**Copyright:** © 2017 Tjørve, Tjørve. This is an open access article distributed under the terms of the [Creative Commons Attribution License](https://creativecommons.org/licenses/by/4.0/), which permits unrestricted use, distribution, and reproduction in any medium, provided the original author and source are credited.

**Data Availability Statement:** This article is purely theoretical; there is no data.

**Funding:** The authors received no specific funding for this work.

**Competing interests:** The authors have declared that no competing interests exist.

## Introduction

The Gompertz model [1] is one of the most frequently used sigmoid models fitted to growth data and other data, perhaps only second to the logistic model (also called the Verhulst model) [2]. Researchers have fitted the Gompertz model to everything from plant growth, bird growth, fish growth, and growth of other animals, to tumour growth and bacterial growth [3–12], and the literature is enormous. The Gompertz is a special case of the four parameter Richards model, and thus belongs to the Richards family of three-parameter sigmoidal growth models,

along with familiar models such as the negative exponential (including the Brody), the logistic, and the von Bertalanffy (or only Bertalanffy) [13][14]. Numerous parametrisation and re-parametrisations of the Gompertz model can be found in the literature, though no systematic review of these and their properties have been attempted.

The purpose of this paper is firstly to review existing re-parameterisations or model forms of the Gompertz model and discuss their usefulness, and secondly to present and discuss revised versions of two useful Gompertz-model forms.

A review of the Gompertz model is useful because of the many re-parameterisations in the literature, and because confusion and lack of accordance have caused diverging traditions or practices, which have developed independently within different fields. Here we review 7 re-parameterisations and a number of versions of one of these.

We subsequently describe two slightly modified or revised Gompertz model forms, which we label the Unified-Gompertz (or U-Gompertz) models, and to our knowledge are mostly new to the literature. We label them “unified” versions, because they together simplify the interpretation of growth rates and the other parameters, in addition to their comparison between models. These possible U-Gompertz forms are again special cases of the Unified-Richards (U-Richards) model as described by Tjørve and Tjørve [14]. As U-models, they have a unified set of parameters, which is comparable across all “U-models”. We will also explain the purpose of choosing one of the two U-Gompertz forms instead of one of the many other versions. Already in an earlier paper [14] we showed how we obtained the logistic model and the von Bertalanffy model from the Richards model by restraining its fourth variable to a given value, thus we can also in this way obtain U-versions of the logistic and von Bertalanffy models from the U-Richards model. However, we failed to discuss U-versions of the Gompertz model. To find these is more difficult, because they are particular limited cases of the Richards model.

We do not present or discuss the linearization of these models, as this is less useful with today’s computers and software. Neither do we discuss differential versions (forms). With modern software, we can study the growth rate across time simply by asking for the first and second derivative of the fitted model, from which one can also graph the change in growth rate across time. Moreover, the models we propose here have easily interpretable parameters that fully characterize the slope. It is also not necessary to obtain the second derivative to discuss the inflection point, also because one of parameters in the models we propose provides us with the time at inflection directly.

Because the Gompertz model and its many re-parameterisations are applied in different fields to different types of growth, the notation differs greatly in the literature. We use a simple common notation in the main equations presented. Still, researchers of growth from different fields should find no difficulty in following the discussions, even though the notation is not that they use in their own work. However, we have sometimes applied some specific notation for fields in the text, where particular re-parameterisations are prominent.

Lastly, we present a genealogy of useful Gompertz re-parameterisations (Appendix 1), as our previous paper [14] only gave the genealogy of the other models in the Richards family, including the negative exponential, the logistic, the von Bertalanffy, and the Richards.

## History

The Gompertz [1] model has been in use as a growth model even longer than its better known relative, the logistic model [2]. The model, referred to at the time as the Gompertz theoretical law of mortality, was first suggested and first applied by Mr. Benjamin Gompertz in 1825 [1]. He fitted it to the relationship between increasing death rate and age, what he referred to as “the average exhaustions of a man’s power to avoid death”, or the “portion of his remaining

power to oppose destruction". The insurance industry quickly started to use his method of projecting death risk. However, Gompertz only presented the probability density function.

It was Makeham [15] who first stated this model in its well-known cumulative form, and thus it became known as the Gompertz-Makeham (or sometimes Makeham-Gompertz) model, a name we encounter for the first time in Greenwood's [16] discussions. The first attempt to use a least-squares method for the Gompertz model to find the best curve, was attempted, e.g. [17] [18]. However, they did not linearize the model, as is done later, but only log-transformed the values (dependent variable) to make it easier to determine the sum of squares. This method seems to have been used until the 1940s [19], when Hartley [20] proposed to and first explained how to linearize the Gompertz model.

From the 1920s the cumulative Gompertz-Makeham model also rapidly became a favourite in fields other than that of human mortality, for example in forecasting the increase in demand for goods and services, sales of tobacco, growth in railway traffic, and the demand for automobiles [21][22]. Wright [23] was the first to propose the Gompertz model for biological growth, and the first to apply it to biological data was probably Davidson [24] in his study of body-mass growth in cattle. In 1931 Weymoth, McMillin, and Rich [25] reported the Gompertz model to successfully describe the shell-size growth in razor clams, _Siliqua patula_, and Weymouth and Thompson [26] reported the same for the Pacific cockle, _Cardium corbis_. Soon, researchers began to fit the model to their data by regression, and over the years, the common [15] Gompertz model became a favourite regression model for many types of growth of organisms, such as dinosaurs, e.g. [27] [28], birds, e.g. [13] [29] [30] [31], and mammals e.g. [32] [33] including those of marsupials, e.g. [34] [35]. The Gompertz model is also frequently applied to model growth in number or density of microbes [36, 37], growth of tumours [4, 38, 39], and the survival of cancer patients [40].

Several different re-parameterisations of the traditional cumulative Gompertz model are in use. One of the more important was suggested by Zwietering and colleagues [6] for modelling growth in number of bacteria, and is currently one of the most common models in microbial growth [7, 41,42]. Another prominent re-parametrisation of the Gompertz model is the Gompertz-Laird model, proposed by Laird and fitted to tumor growth data [4]. This model is considered especially useful when we want to discuss the initial value (starting point on the x-axis), and it is greatly used also for describing growth in birds and animals, especially poultry [e.g. 9, 43, 44, 45], and livestock [e.g. 46]. However, the model parameters are not easily interpretable without being converted to more useful measurements.

In addition to ordinary monotonically increasing Gompertz re-parameterisations, modellers of microorganisms in food have developed a number of modified monotonically decreasing Gompertz models for (thermal, pressure, or electric field) inactivation kinetics. We will not discuss any of these here, as their interest is limited to this particular type of "growth" studies.

### Notation and model types

Here we review Gompertz models found in the literature, focusing on how their parameters affect curve characteristics (Fig 1). We have chosen to present the models using a notation typical for organismal growth studies, describing biometric measurements as functions of time; $W(t)$ . Various fields use different notations, for the value measured, for example survival: $S(t)$ , number of cells/bacteria or population size: $N(t)$ , density of cells or microorganisms; $D(t)$ , concentration of organisms $C(t)$ , volume $V(t)$ , body mass: $M(t)$ , and (t) length: $L(t)$ . The dependent variable (left hand side of the equation) can also be stated as relative values, for example given as $W(t)/A$ , where $A$ is the upper asymptote, or $W(t)/W_0$ , where $W_0$ is the initial value (or starting point on the x-axis). The latter then represents the value relative to the starting value

![Figure 1: Shape characteristics of the (Unified) Gompertz model. The graph plots Value (W(t)) on the y-axis against Time (t) on the x-axis. A solid black line represents the Gompertz model curve, which starts at (0, 1.0) and approaches an asymptote at W=10. A dashed line represents the maximum absolute growth rate, which is tangent to the curve at the inflection point (2, 3.68). The inflection point is labeled 'Inflection at 36.79% of asymptote'. The starting point is labeled 'W_0=1.0'. The time of inflection is labeled 'T_I=2'. The asymptote is labeled 'Asymptotes at A=10'. The maximum absolute growth rate is labeled 'Maximum absolute growth rate K_U=1.5'.](7fb5215fd72210a2e4cce6df55550c89_img.jpg)

Figure 1: Shape characteristics of the (Unified) Gompertz model. The graph plots Value (W(t)) on the y-axis against Time (t) on the x-axis. A solid black line represents the Gompertz model curve, which starts at (0, 1.0) and approaches an asymptote at W=10. A dashed line represents the maximum absolute growth rate, which is tangent to the curve at the inflection point (2, 3.68). The inflection point is labeled 'Inflection at 36.79% of asymptote'. The starting point is labeled 'W_0=1.0'. The time of inflection is labeled 'T_I=2'. The asymptote is labeled 'Asymptotes at A=10'. The maximum absolute growth rate is labeled 'Maximum absolute growth rate K_U=1.5'.

**Fig 1. Shape characteristics of the (Unified) Gompertz model (unbroken line).** The inflection value is fixed at 36.79% of the upper asymptote. Here the upper asymptote ( $A$ ) is set at 10.0, maximum absolute growth rate ( $K_U$ ) to 1.5, time at inflection ( $T_I$ ) to 2.0, and the starting point ( $W_0$ ) to 1.0. With a set asymptote and growth rate, time of inflection follows from a given starting point or vice versa. Maximum growth rate is represented by the tangent at inflection (dashed line).

<https://doi.org/10.1371/journal.pone.0178691.g001>

(described as a “dimensionless” measurement). Sometimes the dependent variable is log-transformed, in particular when modelling microbial growth.

### Two main types of Gompertz models

An important realization is that most Gompertz models can be divided into two groups according to type of location parameter, though this has not yet been called to attention in the literature. Most three-parameter Gompertz models have two “shape” parameters that affect curve shape and one “location” parameter that shifts the curve horizontally without changing its shape. The shape parameters change curve shape but leave the value of the location parameter unaltered. The parameter value is kept constant either relative to the x-axis or relative to the y-axis, characterising type I and type II of Gompertz models, respectively.

In the type I models, a single parameter controls the time (i.e. x-value) at which a specific point on the curve occurs. The point represents a fixed proportion (or percentage) of the upper asymptote, and the time at which this point occurs is not affected by the other parameters (though all other points along the curve are). In some models this point falls at the inflection, which in the Gompertz model occurs at 36.8% of the upper asymptote (Fig 1). In other models, it falls at some other fixed percentage of the asymptote.

In type II models, a single parameter controls the starting value for the curve (i.e. the intersection with the y-axis). In these re-parameterisations, the other parameters do not affect the starting point. Fig 2A and 2B illustrates how the shape parameter changes the curve in a type I model, (Fig 2A) and in a type II model (Fig 2B). Most of the models reviewed here fall into either of these two types, and type II is the commoner of the two.

## Model review

Some of the re-parameterisations of the Gompertz model found in the literature are more useful than others, because they have easy interpretable parameters. One valuable and commonly found re-parameterisation is:

$$W(t) = A \exp(-\exp(-k_G(t - T_i))), \quad (1)$$

where $W(t)$ is the expected value (mass or length) as a function of time (for example days since birth or hatching) and $t$ is time, $A$ represents the upper asymptote (adult value), $k_G$ is a growth-rate coefficient (which affects the slope), and $T_i$ represents time at inflection. The $T_i$ -parameter shifts the growth curve horizontally without changing its shape and is therefore what is often termed a location parameter (whereas $A$ and $k_G$ are shape parameters), which means that this is a type I model. However, more specifically we will refer to model (1) as a $T_i$ -form, because $T_i$ is one of the parameters, opposed to the $W_0$ form (which does not include $T_i$ ). We have a $W_0$ -form of a model in the case that $W_0$ is the value (starting point/intersection) on the y-axis (intersection). All $W_0$ -models are type II. In an earlier work [14] we systemized a number of $T_i$ —and $W_0$ forms for other growth models in the Richards family: the negative exponential, the logistic, and the von Bertalanffy.

Most other re-parameterisations of the Gompertz model found in the literature are less useful, in that their parameters are more difficult to interpret, for example:

$$W(t) = A \exp(-\exp(-k_G t + b)), \quad (2)$$

and

$$W(t) = A \exp(-c \exp(-k_G t)), \quad (3)$$

which are both type II models, but where the $b$ -parameter and the $c$ -parameter both make the starting point behave as a relative value (a percentage of the upper asymptote), and neither of the two represent the relative value for the starting point (which therefore has been derived from some equation). Thus it is not correct as, for example, Kurnianto and colleagues [47] state, that the $c$ -parameter (in model (3)) has “no specific biological significance”. We see that one can convert the location-parameter values between models (1), (2), and (3) from the following equations: $b = \ln(c)$ so that $c = \exp(b)$ , $b = k_G \cdot T_i$ so that $T_i = b/k_G$ , and $c = \exp(k_G T_i)$ so that $T_i = \ln(c)/k_G$ . Still, we have to conclude that model (1) is more useful than the other two, as we get the $T_i$ parameter directly, instead of having to calculate it.

### The four-parameter Gompertz

In growth-curve analyses of bacterial (or microbial) counts, in particular, the fitting of a four-parameter Gompertz model, as suggested by Gibson et al. [36] [48] (but sometimes erroneously attributed to Jeffries et al. [49]), who only discusses a three-parameter Gompertz), has become commonplace. Using our notation (for comparison), this model becomes:

$$W(t) = B + A \exp(-\exp(-k_G(t - T_i))), \quad (4)$$

recognizing that it is a parameterisation of model (1). The extra parameter in this model, $A$ ,

![Figure 2: Two kinds of type II models. Panel A shows Gompertz type IIa curves with different location parameters W_0. Panel B shows Gompertz type IIb curves with different shape parameters W_0. Both panels plot Value against Time, with curves starting at different points at Time = 0 and approaching different upper asymptotes.](55d2bfe1c3d04e86df8d7a104d802172_img.jpg)

Figure 2 consists of two panels, A and B, each showing a plot of 'Value' on the y-axis (ranging from 0 to 6) against 'Time' on the x-axis (ranging from -5 to 10). Both panels show four curves corresponding to different starting-point values ( $W_0$ ) at Time = 0, marked with dots at y-values of 1, 2, 3, and 4. In Panel A, labeled 'Gompertz type IIa Location-parameter $W_0$ ', the curves are vertically shifted but all approach the same upper asymptote of approximately 7.5. In Panel B, labeled 'Gompertz type IIb Shape-parameter $W_0$ ', the curves are also vertically shifted, but they approach different upper asymptotes, with the highest curve approaching approximately 7.5 and the lowest curve approaching approximately 2.5.

Figure 2: Two kinds of type II models. Panel A shows Gompertz type IIa curves with different location parameters W_0. Panel B shows Gompertz type IIb curves with different shape parameters W_0. Both panels plot Value against Time, with curves starting at different points at Time = 0 and approaching different upper asymptotes.

**Fig 2. Two kinds of type II models.** Both panes show Gompertz curves four different starting-point values ( $W_0$ ). Panel 2a illustrates how the $W_0$ -parameter affects the curve in type-IIa models (where $W_0$ acts as a location parameter, keeping the upper asymptote constant), and panel 2b illustrates how the $W_0$ -parameter affects the curve in type-IIb models (where $W_0$ acts as shape parameter, changing the upper asymptote).

<https://doi.org/10.1371/journal.pone.0178691.g002>

represents the lower asymptote of the curve, but serves as a location parameter that moves the model curve vertically, without changing its shape. Therefore, the upper asymptote becomes A

- $B$ . The dependent variable, $W(t)$ (or $L(t)$ ), usually described as the log count of bacteria at time $t$ [36], meaning that the dependent variable is log-transformed. $A$ is typically described as the asymptotic log-count as time decreases infinitely. To be precise, (4) is not a Gompertz model when the dependent variable is log-transformed. However, Jefferies et al. [49] show how model (1) can be log transformed to become:

$$\ln W(t) = \ln A - \exp(-k_G(t - T_i)). \quad (5)$$

A simple rewrite of the four-parameter Gompertz, (4), provides what we have referred to as a “compressed form” of the Gompertz model (see [14] for discussion of compressed forms):

$$W(t) = B + (A - B)\exp(-\exp(-k_G(t - T_i))), \quad (6)$$

where $B$ , which is the lower asymptote, compresses the curve by lifting the lower asymptote without altering the upper asymptote (see also Appendix 1 for a genealogy of Gompertz models).

Both in microbiology (cell or bacteria counts) and in studies of organismal growth, the growth-rate coefficient, $k_G$ , found in many of the Gompertz versions, is often referred to as the “relative growth rate” at inflection (thus maximum relative growth rate). This is incorrect, if we assume that “relative growth rate” must be interpreted as the growth rate given as a proportion (or percentage) of the upper asymptote per time unit, $(W/A) \cdot t^{-1}$ . This mistake (or imprecision) is found both when model (1) [48] and model (3) [36][48] are proposed for microbial growth, and this imprecision has been copied by a very large number of authors. However, to find maximum relative growth rate (i.e. at inflection and relative to maximum value) we must divide $k_G$ with the base of the natural logarithm ( $k_G/e$ ). Accordingly, the absolute growth rate is found by multiplying the relative growth rate with the value for the upper asymptote ( $k_G \cdot A/e$ ).

### The Zwietering modification

The re-parameterisation proposed by Zwietering and colleagues [6] is often called a “modified Gompertz” (e.g.[50]) and is typically applied to bacterial growth data, especially in food. It can be given as:

$$W(t) = A \exp\left(-\exp\left(\frac{e \cdot K_Z}{A}(T_{Lag} - t) + 1\right)\right). \quad (7)$$

This is a type I Gompertz model where $K_Z$ is the absolute growth rate (i.e. tangent to the curve) at time $T_{Lag}$ , termed the “lag time”, which is interpreted as the time between when a microbial population is transferred to a new habitat recovers and when a considerable cell division occurs. $T_{Lag}$ falls at where $W(t) = A \cdot \exp(-e)$ . This means that the so-called lag time ( $T_{Lag}$ ) always occurs at the same percentage (6.6%) of the upper asymptote. This means that the location parameter ( $T_i$ in models (4) to (6)) is modified to control some other than position than the inflection time.

When this model is fitted to microbial growth data, the dependent variable is typically transformed into the logarithm of the relative population size ( $\ln(N(t)/N_0$ , where $N_0$ is population size at $t = 0$ ) [6]. An important advantage of the Zwietering re-parameterisation is that the growth coefficient ( $K_Z$ ) constitutes the absolute growth rate at inflection, and that $A$ (the upper asymptote) does not affect this parameter. However, for many types of growth $T_{Lag}$ is less intuitive than the $T_i$ -parameter.

### The Zweifel and Lasker re-parameterisation

Zweifel and Lasker's [51] re-parameterisation was copied by Ricker [5] in his book and found its way into the study of fish growth. Today it is often referred to as the Ricker model. It is a good example of a plain type II model where the location parameter represents the absolute value of the starting point on the x-axis. This model is mostly used for fish growth [e.g. 52–57], but it is also fitted to growth data from other animals, for example crustaceans [e.g. 58]. It can be expressed as:

$$W(t) = W_0 \exp(m(1 - \exp(-k_G t))), \quad (8)$$

Where the value of the growth coefficient, $k_G$ , is comparable to that in models (1) to (6). $W_0$ is specified as the initial value (number, density, mass, length etc.). It gives the starting point on the growth curve, though also changing the upper asymptote, because it changes the starting point (intersection with the y-axis) by scaling the curve vertically. In addition, the third parameter, $m$ , affects the upper asymptote ( $A$ ) by scaling the model vertically. The upper asymptote is found by $A = W_0 \exp(m)$ . Both $k_G$ and $m$ affects the time of inflection.

Both Zweifel and Lasker [51] and Ricker [5] used the letter $k$ to denote our $m$ , some other notation for our $k_G$ , and $t_0$ to denote our $T_i$ (time of inflection). This has caused some misunderstandings, as the growth coefficient $k_G$ has erroneously been described as “a dimensionless parameter” and our $m$ has erroneously been described as the growth rate. Moreover, $k_G \cdot m$ has been described as “growth rate at $t = 0$ ” e.g. [5]. However, absolute growth rate at $t = 0$ (the initial growth rate) is $W_0 k_G \cdot m$ (and the relative growth rate at $t = 0$ becomes $k_G \cdot m / \exp(m)$ ). Moreover, maximum relative growth (found at time of inflection) becomes $e \cdot k_G \cdot m$ .

This model, (8), is also, as is model (1) (see model (5) above), sometimes encountered log-transformed (e.g. [54] [59]), in our notation stated as:

$$\ln W(t) = \ln W_0 + m(1 - \exp(-k_G t)). \quad (9)$$

### The Gompertz-Laird

Another, and very frequently encountered, type II re-parametrisation is the version of the Gompertz model originally proposed in 1974 by Laird [4][38][60] to describe the growth of tumour size but it is often fitted to growth in numbers (populations) of cells and microbes. The Laird re-parameterisation prevails even today as the most frequently fitted Gompertz version in cancer research, and is now also commonly fitted to growth data in other fields, in particular those of domestic (poultry and livestock) [9, 43–46] and marine (e.g. molluscs, fish, and dolphins) [61–66] animals. It is referred to as the Gompertz-Laird or simply the Gompertz, or even the “modified Gompertz”, as is also model (8). Therefore, one often has to examine the equation to determine whether model (8) or the Gompertz Laird has been used. Moreover, we also found that many authors who stated that they had used the Gompertz-Laird in fact had used some other re-parameterisation, usually model (8).

With the notation of Aggrey [9] (often encountered in studies of growth in domestic animals) the Gompertz-Laird model becomes:

$$W(t) = W_0 \exp\left(\left(\frac{L}{K}\right)(1 - \exp(-Kt))\right). \quad (10)$$

We may consider this model as a variant of model (8) (or vice versa), but in reality their parameters behave quite differently. The $W_0$ -parameter is comparable to those of model (8), but the other parameters are not. The interpretation of the $K$ - and $L$ -parameters vary in the literature and are often ambiguous or not well explained.

The model is again (as is model (10)) unusual in that the $W_0$ -parameter not only changes the intersection with the $x$ -axis by repositioning the curve horizontally, but rescales the $x$ -axis, so that all values increase or decrease proportionally. Thereby $W_0$ (contrary to other models) not only affects the initial value ( $W_0$ ), but also the upper asymptote, $A$ . Thus, while in most of the other (type II) models discussed here $W_0$ behaves as a location parameter (shifting the whole curve horizontally), in model (10) $W_0$ turns more into a shape parameter.

The $L$ -parameter has been described as “the initial specific growth rate” [9], which is a term that is difficult to understand. In reality, $L$ measures neither relative growth nor maximum growth (which falls at inflection). However, the absolute growth rate conveniently becomes $W_0 \cdot L$ at $t = 0$ . Thus, $L$ is the initial absolute growth rate divided by the initial value. To further complicate interpretation, the $L$ -parameter also changes the upper asymptote, $A$ , and the inflection time, $T_i$ . Consequently, $L$ affects three shape characteristics of the growth curve, in addition to growth rate. This makes it difficult to interpret this parameter and compare its values between data sets. It is sometimes erroneously described as maximum relative growth (rate) [67–70].

The $K$ -parameter affects both maximum growth and the upper asymptote, as does the $k_{RI}$ -parameter in model (8). Thus both $L$ and $K$ affect maximum growth rate (i.e. growth rate at inflection). However, the $K$ -parameter affects neither inflection time, nor the initial growth rate ( $W_0 L$ ), which are both affected by the $L$ -parameter. According to Aggrey [9], the $K$ -parameter is the “rate of exponential decay of initial specific growth rate”, a statement copied by many subsequent papers on poultry and livestock growth (see above). This means that it influences how fast the growth curve levels off (towards its asymptote). Thereby $K$ also affects the time of inflection, maximum relative growth rate, and upper asymptote.

Summing up which parameters control the three main shape characteristics, we find that $L$ and $K$ both affect maximum relative growth rate and time of inflection, whereas all three parameters, $L$ , $K$ , and $W_0$ , together control the upper asymptote. This makes it more difficult to interpret the parameter values of model (10) than for example model (1), where each parameter only affects one of these shape characteristics. The strength of the Gompertz-Laird is the inclusion of the $W_0$ -parameter, which gives us the fitted value at the starting point (and allows us to restrict the starting point by fixing it to a particular value), and that the starting-point growth rate is easy to calculate. The weakness of the Gompertz Laird is the complicated interpretation of its parameters, in addition to the loss of the $T_i$ -parameter (time of inflection) and the $A$ -parameter (easily recognizable as time of inflection and asymptote, respectively).

### Simpler $W_0$ -forms

Another type-2 re-parameterisation, is that suggested by Norton [39]. It is sometimes incorrectly considered to be a Gompertz-Laird model, and is given as:

$$W(t) = W_0 \exp \left( \ln \left( \frac{A}{W_0} \right) (1 - \exp(-k_G t)) \right). \quad (11)$$

This model (11) has very different parameters from Laird’s model. It has the same growth-rate coefficient and the same parameter for the initial value (or starting point) as model (8). The model does not (contrary to the Gompertz-Laird) alter its upper asymptote when the starting-point parameter, $W_0$ , is changed. Because the parameters are easily interpretable and control single curve characteristics, Norton’s re-parameterisation is a very useful one. However, we

can rearrange this model to a more convenient form:

$$W(t) = W\left(\frac{A}{W_0}\right)^{1-\exp(-k_G t)} \quad (12)$$

This is the exact same model as (11). However, several other and maybe simpler versions of this model can be found, for example the one proposed by Rogers et al. [71], given as:

$$W(t) = A \exp\left(\ln\left(\frac{W_0}{A}\right) \exp(-k_G t)\right). \quad (13)$$

An easy way to achieve this model version is to derive it from Eq (3), because $c = \ln(A) - \ln(W_0)$ (thus substituting $\ln(A/W_0)$ for $c$ , or $\ln(W_0/A)$ for $(-c)$ , which both give model (12)) (see also for example Mignon-Grasteau et al. [72]). (The log-transformed version of (13) is found in Appendix 1). By rearrangement we can rewrite (13) (or indeed also (11) and (12)) into a simpler form (which we have not seen previously in the literature):

$$W(t) = A \left(\frac{W_0}{A}\right)^{\exp(-k_G t)}. \quad (14)$$

This re-parameterisation (14) can also be rearranged into other forms (see Appendix 1), which should be recognized as restructured versions of the exact same re-parameterisation of the Gompertz, together Eqs (11), (12) and (13).

Terming model (1) the $T_i$ -form and terming model (11) to (14) the $W_0$ -forms of the traditional Gompertz, we designate the simplified model (14) the preferred version. The two complementary models form (1) (the $T_i$ -form) and (14) (the $W_0$ -form) which supplement each other, because they together provide parameter values for four easily interpretable parameters, each controlling only one shape characteristic. Specifically, $A$ controls the upper asymptote; $W_0$ controls the intersection with the x-axis (starting point), $k_G$ controls the slope at inflection (maximum growth rate), and $T_i$ controls the age at inflection (age time at maximum growth rate).

Fitting the two model forms to data gives us the exact same curve and values for four parameters, $A$ , $k$ , $T_i$ and $W_0$ . Therefore, this $W_0$ -form, (14), because it has the $W_0$ -parameter, becomes a useful and simple alternative to fitting the Gompertz-Laird.

#### Two kinds of $W_0$ -parameters

In the above, we described two ways the $W_0$ -parameter may affect the growth curve. In all models, naturally, $W_0$ controls the starting value (i.e. the intersection with the x-axis). However, by changing its value, one necessarily affects the curve. In some models $W_0$ acts as a location parameter (Fig 2A) that shifts the curve horizontally without changing its shape. In other models $W_0$ acts as a shape parameter that scales the whole curve vertically (Fig 2B), thereby affecting the value of the upper asymptote. In other words, the model forces the starting point to behave like a relative value, meaning that when changing its absolute value, it is still locked at a given percentage of the upper asymptote.

This means that we can divide type II Gompertz models into two groups, type IIa (where $W_0$ is a location parameter) and type IIb (where $W_0$ is a shape parameter). Model (8) and (10) have $W_0$ -parameters that scale the curve vertically, whereas models (11) to (14) have $W_0$ -parameters that shifts the curve horizontally.

## The Unified-Gompertz

The traditional three-parameter Gompertz model, as the version shown in Eq (1), is a special case of the four-parameter Richards model, for example given as:

$$W(t) = A(1 - (1/d) \cdot \exp(-k_R(t - T_i)))^d, \quad (15)$$

where $k_R$ is the model-specific growth constant controlling maximum growth rate, and the $d$ -parameter controlling the inflection value (e.g. mass or length). This model, (15), suffers from the same problem as the traditional Gompertz models, including models (1) and (14), namely that the growth parameter ( $k_G$ ) is not comparable to growth coefficients in versions of other traditional models, for example versions of the logarithmic model and the von Bertalanffy (which are also species cases of the Richards model). Moreover, these growth parameters (or growth coefficients) are more difficult to interpret because they do not constitute the absolute or relative growth rate. We [14] therefore recommended two Richards-model forms, which we termed the Unified-Richards (or U-Richards). The first of these, the $T_i$ -form of the U-Richards [14, 73], is given as:

$$W(t) = A \left( 1 + (d - 1) \cdot \exp \left( \frac{-k_U(t - T_i)}{d^{d/1-d}} \right) \right)^{1/1-d}, \quad (16)$$

where $d$ is the fourth parameter (shifting the inflection value). The second, the $W_0$ -form of the U-Richards, [14] then becomes:

$$W(t) = A \left( 1 + \left( \left( \frac{W_0}{A} \right)^{1-d} - 1 \right) \cdot \exp \left( \frac{-k_U \cdot t}{d^{d/1-d}} \right) \right)^{1/1-d}. \quad (17)$$

Unified versions of the logistic model and the von Bertalanffy model are achieved by substituting the $d$ -parameter model (16) and (17) with a constant; $d = 2$ and $d = 2/3$ , respectively. However, the Gompertz models are not reached simply by limiting the $d$ -parameter to a fixed value, because it is calculated as a limit. This is because these model forms converge to Gompertz models when $d \rightarrow 1$ , but $d \neq 1$ (as the traditional Richards models also do). This means that we achieve U-Gompertz forms by substituting $e \cdot k_U$ for $k_G$ in model (1) and (14). The $T_i$ -form of the U-Gompertz then becomes:

$$W(t) = A \exp(-\exp(-e \cdot k_U(t - T_i))). \quad (18)$$

Moreover, the U-Gompertz of the simple $W_0$ -form presented in Eq (14) becomes the natural alternative when we prefer the model to return the starting value ( $W_0$ ) rather than the inflection time ( $T_i$ ). The $W_0$ -form can then be reformulated to become:

$$W(t) = A \left( \frac{A}{W_0} \right)^{\exp(-e \cdot k_U \cdot t)}. \quad (19)$$

This also means that by dividing the $k_G$ -value of Gompertz models (1) and (14) with $e$ , we obtain the maximum relative growth rate at inflection, $k_U$ . Thus $k_U = k_G/e = k/2.71828$ . The subscript "U" may denote the universality of this growth coefficient, representing relative growth rate rather than being a mere coefficient.

By re-parameterizing Gompertz forms (1) and (14), the traditional $k_G$ -parameter has given way for the new $k_U$ -parameter in two new model forms, (18) and (19). We term these the _Universal-Gompertz_ (or U-Gompertz). In these two forms not only $A$ , $W_0$ , and $T_i$ are readily interpretable (as they are in model (1) and (14)), but also the $k$ -parameter, $k_U$ , which has become

the maximum relative growth rate. The absolute growth rate then becomes $A \cdot k_U$ . Note that $k_U$ does not affect $T_i$ (as $k_Z$ does in model (4)), but does affect $W_0$ (unless $T_i = 0$ , meaning that the inflection point falls at the $x$ -axis).

Because the two U-Gompertz forms in essence are the same model, we can also calculate $W_0$ in model (19) from $T_i$ in model (18) or vice versa, instead of fitting both model forms to the same data set. The conversion equations, replacing $k_Z/A$ for $k_U$ , then becomes:

$$W_0 = A \cdot \exp(-\exp(e \cdot k_U T_i)), \quad (20)$$

and

$$T_i = \frac{\ln(-\ln(\frac{W_0}{A}))}{e \cdot k_U}. \quad (21)$$

This conversion is possible also between the $W_0$ and $T_i$ -parameters of model (1) and (14). We find these conversion equations by substituting $k_G$ for $e \cdot k_U$ in (18) and (19).

In the Gompertz model, the value at inflection ( $W_i$ ) is locked at 36.8% of the upper asymptote, and is calculated as $W_i = A/e$ . The $W_i$ -value of the U-Richards, however, is controlled by the $d$ -parameter, and it is calculated as $W_i = A/d^{1/(1-d)}$ . It is an important feature that the $k_U$ -parameter (maximum relative growth rate) in the U-Richards model, (16) and (17), is the same as in new U-Gompertz model, (18) and (19). This means that if both models are fitted, either to the same or to different data sets, the $k_U$ -parameter can be compared between the two models without any conversion equation. This also holds for the other models (U-logistic and U-Bertalanffy) in the U-Richards family [14]. The growth constants of the traditional models (logistic, Gompertz, von Bertalanffy, and Richards) are, unfortunately, not directly comparable.

**Absolute growth rate.** Earlier authors have also noted, more or less explicitly, that it is possible to re-parameterize the Gompertz model so that the growth parameter returns a relative or an absolute growth rate, as in model (7), above; although the growth rate in this model [6] is the absolute rate at the starting point ( $t = 0$ ) rather than at time of inflection ( $T_i$ ) (e.g. model (18) and (19)). However, we may re-parameterise models (18) and (19) in order to return absolute instead of relative growth rates at inflection ( $K_U$ ), i.e. maximum absolute growth rates. The $T_i$ -form of the U-Gompertz model (18) then becomes:

$$W(t) = A \exp\left(-\exp\left(-\frac{e \cdot K_U(t - T_i)}{A}\right)\right), \quad (22)$$

and the $W_0$ -form of the U-Gompertz (19) becomes:

$$W(t) = A \left(\frac{A}{W_0}\right)^{\exp(-e \cdot K_U \cdot t/A)}. \quad (23)$$

This offers a choice between $W_0$ -type models that return maximum absolute growth instead of relative growth. Whether one chooses model (18), (19), (22), or (23) depends on which parameter value is most convenient to discuss and to compare between data sets. If the purpose is to compare statistically values between data sets, one should fit the model that returns the value; absolute or relative growth rate, that one wants to compare. The software then usually provides standard errors (or confidence intervals) for the parameter values

## Conclusion

This article's main contributions are the new U-Gompertz model forms, and pertaining deliberations. The changes relative to traditional models are simple, and may seem trivial, but are of great importance to those of us who study organismal growth. The two new U-Gompertz forms provide easy interpretation of all shape parameters, also because each parameter only affects one shape characteristic. In addition, the parameter for maximum growth rate is comparable to the growth-rate parameter of all models in the U-family. This makes it easier to describe most types of organismal growth following the shape of the Gompertz model and to compare fitted parameter values across models. Moreover, confidence intervals are easily calculated for estimated parameters, but are difficult to obtain from derived measurements that have to be calculated from parameter values. Therefore, directly biologically interpretable parameters are preferable, like those returned by the two U-Gompertz forms. Being able to calculate confidence intervals for the fitted values, we can also compare these values between data sets, by applying for example a t-test or an ANOVA.

This development also fills a gap in our 2010 paper [14], which reviews and discusses the U-model family, including re-parametrisations of the negative exponential, logistic, and von Bertalanffy models, but not the Gompertz model. In addition, we present a rearrangement, which we have not seen in the literature, of the $W_0$ -version of the traditional Gompertz model in a simpler form.

When studying growth, one is sometimes more interested in the starting point, $W_0$ , of the curve than the exact upper asymptote, as should be the case in growth studies of poultry and livestock more than in wild birds and mammals. Then one will probably want to choose a model that directly returns a $W_0$ -value. The $W_0$ -form of the Gompertz, and preferably the U-Gompertz, is a good alternative to the Gompertz-Laird. The $L$ -parameter of the Gompertz-Laird (which does not have a simple interpretation) and the lack of an $A$ -parameter are problematic in this model. We believe that both the $T_i$ and the new $W_0$ -form of the U-Gompertz model gives easy and fast access to the shape parameters needed for most types of growth studies. Because of its $W_0$ -parameter, the $W_0$ -form of the U-Gompertz promises to be a useful alternative also to the traditional Gompertz-Laird. The U-Gompertz forms are even alternatives to the two U-Richards forms, when a three-parameter model is preferred. Still, the usefulness of the U-models, like the U-Richards and the U-Gompertz, and their $W_0$ -forms in particular, have yet to be firmly established, though the $W_0$ -form of the U-Richards has already been successfully fitted to, for example, the growth of yoghurt bacteria [74][75], and the growth of wader chicks [76][77][78].

## Supporting information

**S1 Appendix. A genealogy of some useful and recommended Gompertz models and their U-model versions.**  
(DOCX)

## Author Contributions

**Conceptualization:** KMCT ET.

**Methodology:** KMCT ET.

**Project administration:** KMCT ET.

**Software:** KMCT ET.

**Visualization:** KMCT ET.

**Writing – original draft:** KMCT ET.

**Writing – review & editing:** KMCT ET.

## References

- Gompertz B. On the nature of the function expressive of the law of human mortality, and on a new mode of determining the value of life contingencies. _Philosophical Transactions of the Royal Society of London B: Biological Sciences_. 1825; 182:513–85.
- Verhulst P-F. Notice sur la loi que la population suit dans son accroissement. _Correspondance mathématique et physique_. 1938; 10:113–21.
- Winsor CP. The Gompertz curve as a growth curve. _Proc. Nat. Acad. Sci._ 1932; 18(1):1–8. PMID: [16577417](#)
- Laird AK. Dynamics of tumor growth. _British Journal of Cancer_. 1964; 18:490–502.
- Ricker WE. Growth rates and models. In: Hoar WS, Randall DJ, Brett JR, editors. _Fish physiology_. London: Academic Press; 1979. p. 677–743.
- Zwietering MH, Jongenburger I, Rombouts FM, Van't Rie T K. Modeling of the bacterial growth Curve. _Appl. Env. Microbiol._ 1990; 56(6):1975–81.
- Skinner GE, Larkin JW. Mathematical modeling of microbial growth: a review. _Journal of Food Safety_. 1994; 14:1975–217.
- Stark JM, Ricklefs RE. Avian growth and development. The evolution within the altricial-precocial spectrum. New York, Oxford: Oxford University Press; 1998. 441 p.
- Aggrey SE. Comparison of three nonlinear and spline regression models for describing chicken growth curves. _Poultry Science_. 2002; 81:1782–8. PMID: [12512566](#)
- Paine CET, Matthews TR, Vogt DR, Purves D, Rees M, Hector A, Turnbull LA. How to fit nonlinear plant growth models and calculate growth rates: and update for ecologists. _Methods in Ecology and Evolution_. 2012; 3:245–56.
- Benzekry S, Lamont C, Beheshti A, Tracz A, Ebos JML, Hlatky L, Hahnfeldt P. Classical mathematical models for description and prediction of experimental tumor growth. _PLOS Computational Biology_. 2014; 10(8): e1003800.
- Halmi MIE, Shukor MS, Johari WIW, Shuker MY. Evaluation of several mathematical models for fitting the growth of the algae _Dunaliella tertiolecta_. _Asian Journal of Plant Biology_. 2014; 2(1):1–6.
- Tjørve K, Tjørve E. Shapes and functions of bird-growth models: How to characterize chick postnatal growth. _Zoology_. 2010; 113(6):326–33. <https://doi.org/10.1016/j.zool.2010.05.003> PMID: [21115290](#)
- Tjørve E, Tjørve KMC. A unified approach to the richards-model family for use in growth analyses: Why we need only two model forms. _Journal of Theoretical Biology_. 2010; 267:417–25. <https://doi.org/10.1016/j.jtbi.2010.09.008> PMID: [20831877](#)
- Makeham WM. On the integral of Gompertz's function for expressing the values of sums depending upon the contingency of life. _Journal of the Institute of Actuaries and Assurance Magazine_. 1873; 17(5):305–27.
- Greenwood M. Discussion on the value of life-tables in statistical research. _Journal of the Royal Statistical Society_. 1922; 85(4):537–60.
- Rietz HL. Properties of Makeham's laws of mortality with applications. _The American Mathematical Monthly_. 1921; 28(4):158–65.
- Trachtenberg HL. The wider application of the Gompertz law of mortality. _Journal of the Royal Statistical Society_. 1924; 87(2):278–90.
- Stoner PM. Fitting the exponential function and the Gompertz function by the method of least squares. _Journal of the American Statistical Association_. 1941; 35(216):515–8.
- Hartley HO. The estimation of non-linear paramter by 'internal least squares'. _Biometrika_. 1948; 35(1/2):32–45.
- Proscott RB. Law of growth in forecasting demand. _Journal of American Statistical Association_. 1922; 18(140):471–9.
- Peabody LE. Growth curves and railway traffic. _Journal of the American Statistical Association_. 1924; 19(148):476–83.
- Wright S. Book review. _American Statistical Society Quarterly Journal_. 1926; 21:493–7.

24. Davidson FA. Growth and senescence in purebred Jersey cows. Univ of Illinois Agricultural Experiment Station Bull. 1928; 302:192–9.
25. Weymouth FW, McMillin HC, Rich WH. Latitude and relative growth in razor clam _Siliqua patula_. J Exp Biol. 1931; 8:228–49.
26. Weymouth FW, Thompson H. S. The age and growth of the pacific cockle (_Cardium corbis_, Martyn). Bulletin US Bureau of Fisheries. 1931; 46:633–41.
27. Cooper LN, Lee AH, Taper ML, Horner JR. Relative growth rates of predator and prey dinosaurs reflect effects of predation. Proceedings of the Royal Society, London B. 2008; 22(275):2609–15.
28. Lee AH, Huttenlocker K, Padian K, Woodward HN. Analysis of growth rates. In: Padian K, Lamm E-T, editors. Bone histology of fossil tetrapods: Advancing methods, analysis, and interpretation. Berkeley: University of California Press; 2013. p. 209–43.
29. Ricklefs RE. A graphical method of fitting equations to growth curves. Ecology. 1967; 48:978–83.
30. Ricklefs RE. Patterns of growth in birds. Ibis. 1968; 110(4):419–51.
31. Tjørve KMC, García-Peña GE, Székely T. Chick growth rates in charadriiformes: Comparative analyses of breeding climate, development mode and parental care. Journal of Avian Biology. 2009; 40(5):553–8.
32. Zullinger EM, Ricklefs RE, Redford KH, Mace M. Fitting sigmoidal equations to mammalian growth curves. Journal of Mammalogy. 1984; 65(4):607–6.
33. Begall S. The application of the Gompertz model to describe body growth. Growth, Development, and Aging. 1997; 61(2):61–7. PMID: [9348472](#)
34. Lee AK, Cockburn A. Evolutionary ecology of marsupials. Cambridge: Cambridge University Press; 1985.
35. Cockburn A, Johnson CN. Patterns of growth. In: Tyndale-Biscoe CH, Janssens PA, editors. The developing marsupial, models for biomedical research. Berlin: Springer-Verlag; 1988. p. 28–40.
36. Gibson AM, Bratchell N, Roberts TA. The effect of sodium chloride and temperature on the rate and extent of growth of _Clostridium botulinum_ type A in pasteurized pork slurry. Journal of Applied Bacteriology. 1987; 62(6):479–90. PMID: [3305458](#)
37. López S, Prieto M, Dijkstra J, Dhanoa MS, France J. Statistical evaluation of mathematical models for microbial growth. International Journal of Food Microbiology. 2004; 96(3):289–300. <https://doi.org/10.1016/j.jifoodmicro.2004.03.026> PMID: [15454319](#)
38. Laird AK. The dynamics of growth. Res Dev. 1969; 20(8):28–31.
39. Norton L. A Gompertzian model of human breast cancer growth. Cancer Research. 1988; 48:7067–7141. PMID: [3191483](#)
40. Riffenburgh RH, Johnstone PAS. Survival patterns of cancer patients. Cancer. 2001; 91(2):2469–75.
41. Buchanan RL. Using spreadsheet software for predictive microbiology applications. Journal of Food Safety. 1991; 11(1991):123–34.
42. Buchanan RL. Predictive food microbiology. Trends in Food Science & Technology. 1993; 4(1):6–11.
43. Nahashon SN, Aggrey SE, Adefope NA, Amenyenu A, Wright D. Growth Characteristics of Pearl Grey Guinea Fowl as predicted by the Richards, Gompertz and logistic models. Poultry Science. 2006; 85:359–63. PMID: [16523639](#)
44. Sengul T, Kiraz S. Non-linear models of growth curves in large white turkeys. Turkish Journal of Veterinary and Animal Science. 2005; 29:331–7.
45. Norris D, Ngambi JW, Benyi K, Makgahlela ML, Shimelis HA, Nesamvuni EA. Analysis of growth curves of indigenous male Venda and naked neck chickens. South African Journal of Animal Science. 2007; 37:21–6.
46. Marinho KmdS, de Freitas AR, Falcão J, de S., Dias FEF. Nonlinear models for fitting growth curves of Nellore cows reared in the Amazon biome. Revista Brasileira de Zootecnia. 2013; 42(9):645–50.
47. Kurianto E, Shinjo A, Suga D. Analysis of growth in intersubspecific crossing of mice using Gompertz model. Asian-Australian Journal of Animal Sciences. 1998; 11(1):84–8.
48. Gibson AM, Bratchell N, Roberts TA. Predicting microbial growth: growth responses of salmonellae in a laboratory medium as affected by pH, sodium chloride and storage temperature. Int. J. Food Microbiol. 1988; 6:155–78. PMID: [3275296](#)
49. Jefferies CJ, Brain P, Stott KG, Belcher AR. Experimental systems and a mathematical model for studying temperature effects on pollen-tube growth and fertilization in plum. Plant, Cell & Environment. 1982; 5(3):231–6.
50. Halmi MIE, Shukor MS, Johari WLW, Shukor MY. Evaluation of several mathematical models for fitting the growth of the algae _Dunaliella tertiolecta_. Asian Journal of Plant Biology. 2014; 2(1):1–6.

51. Zweifel JR, Lasker R. Prehatch and posthatch growth of fishes—a general model. _Fishery Bulletin_. 1976; 74(3):609–21.
52. Munk P. Differential growth of larval sprat _Sprattus sprattus_ across a tidal front in the eastern North Sea. _Marine Ecology Progress Series_. 1993; 99:17–27.
53. Castello L, Castello JP. Anchovy stocks (_Engraulis anchoita_) and larval growth in the SW Atlantic. _Fisheries Research_. 2003; 59:409–21.
54. Nielsen R, Munk P. Growth pattern and growth dependent mortality of larval pelagic juvenile North Sea cod _Gadus morhua_. _Marine Ecology Progress Series_. 2004; 278:261–70.
55. Narimatsu Y, Hattori T, Ueda Y, Matsuzaka H, Shiohaki M. Somatic growth and otolith microstructure of larval and juvenile Pacific cod _Gadus macrocephalus_. _Fisheries Science_. 2007; 73:1257–64.
56. De Albuquerque CQ. Early developmental aspects and validation of daily growth increments in otoliths of _Micropogonias furnieri_ (pisces, sciaenidae) larvae reared in laboratory. _Pan-American Journal of Aquatic Sciences_. 2009; 4(3):259–66.
57. Namiki C, Katsuragawa M, Zani-Teixeira ML. Growth and mortality of larval _Muctophum affine_ (muctophidae, teleostei). _Journal of Fish Biology_. 2015; 86:1335–47. <https://doi.org/10.1111/jfb.12643> PMID: 25846857
58. Piscart C, Devin S, Beisel J-N, Moreteau J-C. Growth-related life-history traits of an invasive Gammarid species: Evaluation with a laird-gompertz model. _Canadian Journal of Zoology_. 2003; 81:2006–14.
59. Otterlei E, Nyhammer G, Folkvord A, Stefansson SO. Temperature- and size-dependent growth of larval and early juvenile Atlantic cod (_Gadus morhua_): a comparative study of Norwegian coastal cod and northeast Arctic cod. _Can. J. Aquat. Sci._ 1999; 56:2099–111.
60. Laird AK, Tyler SA, Barton AD. Dynamics of normal growth. _Growth_. 1965; 29(3):233–4. PMID: 5865686
61. Chicharo L, Chicharo MA. Effects of environmental conditions on planktonic abundances, benthic recruitment and growth rates of the bivalve mollusc _Ruditapes decussatus_ in a Portuguese coastal lagoon. _Fisheries Research_. 2001; 53:235–50.
62. Benetti DD, O'Hanlon B, Rivera JA, Welch AW, Maxey C, Orhun MR. Growth rates of cobia (_Rachycentron canadum_) cultured in open ocean submerged cages in the Caribbean. _Aquaculture_. 2010; 302:195–201.
63. Perrin WF, Coe JM, Zweifel JR. Growth and reproduction of the spotted porpoise, _Stenella attenuata_, in the offshore eastern tropical Pacific. _Fishery Bulletin_ 1975; 74(2):229–69.
64. Barlow J. Reproductive seasonality in pelagic dolphins (_Stenella_ spp.): Implications for measuring rates. _Rep. Int. Whal. Commn. (Special Issue 6)_. 1984;191–8.
65. Mattson MC, Mullin KD, Ingram GWJ, Hoggard W. Age structure and growth of the bottlenose dolphin (_Tursiops truncatus_) from strandings in the mississippi sound region of the northcentral Gulf of Mexico from 1986–2003. _Marine Mammal Science_. 2006; 22(3):654–66.
66. Danil K and Chivers SJ. Growth and reproduction of female short-beaked common dolphins _Delphinus delphis_, in the eastern tropical Pacific. _Canadian Journal of Zoology_ 2007; 85:108–21.
67. Miguel JA, Asenjo B, Ciria J, Calvo JL. Growth and lay modelling in a population of Castellana Negra native Spanish hens. _British Poultry Science_. 2007; 48(6):651–54. <https://doi.org/10.1080/00071660701598414> PMID: 18085446
68. Miguel J.A., Ciria J., Asenjo B., Calvo J.L., 2008. Effect of caponisation on growth and on carcass and meat characteristics in Castellana Negra native Spanish chickens. _Animal Behaviour_ 2, 305–311.
69. Miguel J.A., Ciria J., Calvo J.L., Asenjo B., 2011. Growth modelling of Charolais and Serrana Soriana native Spanish Beef Cattle. _Journal of Agricultural Science and Technology A1_, 778–782.
70. Romera JAM, Asenjo B. Effect of caponisation on growth and on carcass and meat characteristics in Castellana Negra native Spanish chickens. _Animal_. 2008; 2(2):305–11. <https://doi.org/10.1017/S1751731107001127> PMID: 22445025
71. Rogers S, Pesti GM P, Marks HL. Comparison of three nonlinear regression models for describing broiler growth curves. _Growth_. 1987; 51(2):229–39. PMID: 3678935
72. Mignon-Grateau S, Piles M, Varona L, de Rochambeau H, Poivey JP, Blasco A, et al. Genetic analysis of growth curve parameters for male and female chickens resulting from selection on shape of growth curve. _Journal of Animal Science_. 2000; 78:2515–24. PMID: 11048915
73. Sugden LG, Driver EA, Kingsley MCS. Growth and energy consumption by captive mallards. _Canadian Journal of Zoology_. 1981; 59:1567–70.
74. Aghababae M, Khanahmadi M, Beheshti M, Mirlohi M. Temperature and pH optimization for the growth of lactobacillus delbrueckii ssp bulgaricus on wey-based medium using response surface methodology.

The 7th International Chemical Engineering Congress & Exhibition, Kish, Iran 21–24 November. 2014;180:196–205.

75. Aghababae M, Meheshti M, Khanahmadi M. Effect of Temperature on pH on formulating the kinetic growth parameters and lactic production of _Lactobacillus bulgaricus_. Biological Nutrition and Food Sciences Research. 2014; 1:49–56.
76. Catlin DH, Felio JH, Fraser JD. Effects of water discharge on fledging time, growth, and survival on piping plovers on the Missouri river. Management and Conservation. 2013; 77(3):525–533.
77. Catlin DH. Can river management improve the piping plover's long-term survival in the Missouri River? Biological Conservation. 2014; 180:196–205.
78. Tjørve KCM, Tjørve E. Modelling avian growth with the Unified-Richards: As exemplified by wader-chick growth. Journal of Avian Biology. 2017.
