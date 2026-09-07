# FORMLÆRE: actual image-model figures

The earlier programmatically drawn vector figures were rejected by the author. This workflow calls the image model gpt-image-2 through the OpenAI Images API using the bundled, unmodified image_gen.py CLI. It does not ask Astra to write SVG.

Run branch: imagegen-figures-20260907. Uses repository secret OPENAI_API_KEY. Stops immediately if it is missing. Does not print or export the key. No substitute model. Ten separate images, one request per image; serial execution and fail-fast. Outputs are uploaded as an Actions artifact for visual review. They are not automatically approved or inserted into the manuscript.

Source: FORMLAERE_mellomutgaave_Astra_v4_tree(1).pdf. Propositions must be remapped if the rewrite changes their numbering.

- 01_objekt_og_form.png — after 1.32
- 02_mogleg_og_proevd.png — after 1.73
- 03_motstridande_trykk.png — after 2.5
- 04_haug_og_stilart.png — after 3.3
- 05_rangering_over_tid.png — after 4.2
- 06_rekkevidd_og_omhug.png — after 5.6
- 07_formingsregel_og_realisering.png — after 5.73
- 08_forma_mellom_agentane.png — after 6.63
- 09_forklaring_vurdering_mynde.png — after 7.31
- 10_horisont_og_svikt.png — after 8.3
