# 21 Sep — the question set, after the evening review

Recorded because three of these reverse a decision from the 21 Sep
minutes. A reversal that is only in a commit message is a reversal nobody
finds when the minutes are what gets pointed at later.

People are not named here, per this repo's rule; the question owner and
the event lead are "the owner" and "the lead".

## Changed, and shipped

**Plain English over the house vocabulary.** The owner asked whether
anyone understands what "material world" even means. They do not, so the
stem is now *"What is your city made of, and how does it feel?"* and the
options are *White and spotless · Soft and pale · Concrete and stone ·
Earth and timber*.

The replacement offered in the same thread was *"the ambience and
materiality of your future city"*. **`materiality` is more jargon than
the phrase being retired, not less**, so it was not taken. The request
was plain terms; this is the plain-terms version of it. If the exact
phrase was wanted rather than the intent, that is a one-line change and
this note is where the disagreement is written down.

**No visual cues on the phone.** Said four times in the thread.
`visualCues: false` on every question, so each screen is a list of words.

This is a phone switch and **not a deletion**: the art stays on disk,
stays in `visuals-manifest.ts`, and still prints six-to-a-page in the
question book. `gen-question-book.mjs` deliberately does not read the
field. The earlier note in the same day's thread — *"maintain visual 6
per page, consistent"* — is **page** language, about the printed deck, so
both notes hold at once and neither had to lose. That reading is the
reason this was implemented as a switch rather than as a conflict to
escalate.

Not done, deliberately: *"use the visual cues for back end work"* was
NOT wired as reference images for generation. `REFERENCE_MODE` already
defaults to `none` because the edit endpoint reproduces a reference's
framing rather than recomposing — it made all four zones of a table one
picture with small edits. Feeding option art in that way walks into a
known-bad path. See `server/reference.ts`.

**New order**: materials, outdoors, deep work, recharge. Answer rows key
by question id and never by position, so no stored row is orphaned by
this. *(Reverses the minutes' order: outdoors, deep work, recharge,
materials.)*

**Four options, then a paragraph.** Materials drops *Jewel and lacquer*
and *Undersea*, the two least plausible as a workplace. Deep work takes
the four named in the thread and gives the fifth slot to an `open`
option — *"reduce this to 4 options and leave a paragraph for 5"*.
`open` options had been removed in V4; this brings one back, and
`fragmentOf` splices the typed words on both composers, so what a table
invents there is drawn.

**"The sealed cell" became "the sealed mud hut", and its prompt fragment
moved with it.** An acoustic box and an earth room do not draw alike. A
label the picture contradicts is worse than either on its own.

**The landing screen is the title and a button.** The cognitive city is
not lost with the paragraph that used to name it — screen one now asks
it outright.

**The wildcard is "Any other flights of fancy?"**

**The deep-work stem carries "in a centaur organisation" again**, put
back by the owner after being trimmed out earlier the same evening. The
brevity ceiling rose 48 → 60 to allow it. That ceiling exists to stop a
stem becoming a paragraph, not to overrule the person who writes them.

## Confirmed after asking, not assumed

**The outdoors scale keeps the 10–100% slider**, six stops. The thread
proposed *"20%, 40%, or none"*; the minutes §4 asked for the slider, and
the three proposed numbers have no high end — "cabins in a forest" was
the part of the scale the minutes cared about. The slider stands.

**Recharge keeps its six options**, as text, with the typed reply under
them. *"Just a paragraph"* read literally would have retired six option
keys and the `And:` chip row, and recharge is one of the most reliably
drawn things in the render.

## Still open

**The cities.** *"we had discussed reducing the options and also the
names — check notes"*. Those notes are not in this repo and were not
guessed at. Until they arrive, the six lenses and their names are
unchanged. This is the one item blocking a final question book.

## Tests that now hold the reversible parts

- `questions.test.ts` — ceilings on every string a table reads, a floor
  under the longest prompt fragment, and the wildcard asserted by SHAPE.
  Its verbatim pin broke twice in one evening on ordinary rewording and
  the test was wrong both times.
- `prompt-edit.test.ts` — the review screen's prompt edit is discarded
  under `ZONE_SET=hero` and honoured on the four-zone path.
- `progress.test.ts` — one step scale for the phone and the room.
