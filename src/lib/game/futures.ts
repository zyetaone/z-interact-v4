/**
 * FUTURE / TONE PALETTE — VERSION 4's Q1, "Choose your lens" (BRIEF.md
 * §"The questions — VERSION 4", the question owner's 19 Sep 17:58 send).
 * Six futures, plain-named: `name` and `blurb` are her own words verbatim.
 * `worldOutside` is what a render gets from the lens (prompt-recipe.md §2,
 * move 3); `moodLine` stays for the lens picture itself.
 * The names and blurbs are
 * (the blurb's first letter capitalised, since it opens a line on the card).
 * The seventh V3 future, Pragmatist Retrofit, is dropped per V4 — its lens
 * JPEG stays on disk, unreferenced. `key`, `moodLine`, `negativeFragment`
 * and the `LENS_IMAGE` filenames are unchanged from V3 (futures.md
 * §1/§3/§5), so the generated lens pictures still line up. A future is a
 * worldview a table argues from, never a persona.
 *
 * Fixed interface: `FUTURES` is an ordered list; each entry's `moodLine`
 * feeds `prompt.ts`'s `LayerInputs.mood`.
 *
 * Type extension beyond the original stub (documented per the brief): the
 * era chip (futures.md §5, folding Q1 into this screen) needs `eraDefault`,
 * `eraLocked`, `eraAllowed`, `eraWarn` per future, plus `blurb`,
 * `provenance`, `negativeFragment` and `shadowFace` for the phone card and
 * the negative prompt. `key`, `name`, `moodLine` are unchanged; `eraAllowed`
 * is derived from `eraDefault`/`eraLocked` via `game/era.ts`'s `allowedEras`
 * rather than hand-enumerated, so the two can't silently drift apart
 * (era.test.ts checks the same fixture table from the other direction).
 */
import { allowedEras, type Era } from './era';

export interface Future {
	key: string;
	name: string;
	/** The full mood paragraph — what the LENS PICTURE is generated from (`scripts/gen-visuals.mjs`). */
	moodLine: string;
	/** What a table's render gets from the lens: the world through the window — structures,
	 *  density, materials and signage outside the glass — never night, rain or an hour of the
	 *  day: a lens must keep its identity at any time of day, and q11's feel words alone own
	 *  light, weather and time (recipe v2 addendum). Feeds `layers.ts`'s mood. */
	worldOutside: string;
	/** The two or three visual signatures a stranger would name from this lens's card image
	 *  (`static/visuals/lens/<key>.jpg`), ≤18 words, structures and materials only — never light,
	 *  weather or time of day, which q11's feel words own. Composed right after the zone's moment,
	 *  before `worldOutside`: with `insideCue` it is what keeps a lens itself by day. */
	styleDna: string;
	/** One unmistakable 2040 cue INDOORS, ≤12 words — the sibling of `worldOutside` (recipe v2):
	 *  the room must read as the future even when the window is out of frame. */
	insideCue: string;
	/** 12-word phone blurb, under the name. */
	blurb: string;
	/** Shown under the label on the phone: an originator and a year. */
	provenance: string;
	/** The era this future implies. Becomes the table's stored Q1 answer. */
	eraDefault: Era;
	/** True where any other era contradicts the card's own content — the chip is not nudgeable. */
	eraLocked: boolean;
	/** Every era this future's chip may land on. Derived, not hand-listed — see module note. */
	eraAllowed: Era[];
	/** Allowed but worth a word — not contradictory, just a duller picture than the table expects. */
	eraWarn: Era[];
	/** What this lens keeps OUT OF THE WINDOW — density and signage — never materials (the
	 *  table's Q2 answer) and never a time of day or weather (q11's feel words own those, and a
	 *  lens must survive daylight). The lens JPEGs were generated from the V3 ten-term lists;
	 *  they are not regenerated for this. */
	negativeFragment: string;
	/**
	 * LIGHT, WEATHER AND TIME — the `feel` layer, which the lens now owns.
	 *
	 * q11's three feel words used to own this and q11 is gone with the cut to
	 * five questions (the 21 Sep minutes). The owner's call was to fold it
	 * into the lens.
	 *
	 * BE CAREFUL WHAT YOU WRITE HERE. `moodLine` was a per-lens light
	 * paragraph too, and it is why the wall came back at night: neo-seoul's
	 * said "no daylight anywhere". Every line below is therefore written in a
	 * BRIGHT register, and `prompt.ts`'s `EXPOSURE` still says it again from
	 * the house. A lens keeps its identity through its surfaces and its
	 * skyline, not by turning the lights off.
	 */
	lightLine: string;
	/** The dystopian reading of this future — how the palette spans the dystopian pole
	 *  without every card being dystopian. */
	shadowFace: string;
}

/**
 * Terms common to every future's negative prompt (futures.md §3): they carry the
 * no-personas rule and the "moody, not stark white" tone brief. Repeated inside each
 * future's own `negativeFragment` too (so one future can be tuned without touching the
 * others) — exported separately for a consumer that wants to dedupe or state it once.
 */
/**
 * SCREEN ONE'S STEM, in one place because it was in two and they drifted.
 * The phone said "Choose your future city", the printed book said "First:
 * choose your lens", and the e2e spec asserted a third string ("Choose
 * your lens") that neither had said since V4 — so the spec matched nothing
 * and the book contradicted the screen in the question owner's own hands.
 *
 * It lives HERE rather than in `questions.ts` because the lens is not a
 * `Question`: it has no options array, no layer and no push line — it is
 * `FUTURES` itself, and this is that file.
 */
export const LENS_STEM = 'How do you imagine your future cognitive city?';

export const HOUSE_NEGATIVE = 'personas, stark white, posed faces';

function future(f: Omit<Future, 'eraAllowed'>): Future {
	return { ...f, eraAllowed: allowedEras({ eraDefault: f.eraDefault, eraLocked: f.eraLocked }) };
}

export const FUTURES: Future[] = [
	future({
		key: 'garden-city',
		name: 'The garden city',
		provenance: 'Ebenezer Howard, To-morrow, 1898',
		blurb: 'Nature first, buildings second. There is no boundary: the office IS the parkland, low and half-buried in it, and you are never indoors for long.',
		eraDefault: 'recognisably-2035',
		eraLocked: false,
		eraWarn: ['same-as-2026'],
		moodLine:
			'Low horizontal pavilions bedded into a planted park at dusk; rammed earth, weathered oak, oxidised bronze, deep eaves. Light is the last warm hour raking sideways through canopy, pooling amber on timber decks while the shade goes blue-green. Palette: moss, bark, ochre, slate. Two storeys maximum, buildings kept below the tree line. The far skyline sits low and soft behind foliage, half dissolved in humid haze. Distant anonymous figures walking gravel paths. Quiet, unhurried, settled.',
		styleDna:
			'low rammed-earth pavilions half-buried in dense planting, green roofs of deep grasses, mature trees overhead, narrow paths',
		worldOutside: 'beyond the glass, planting to the sill, a shallow pool; weathered oak, bronze',
		insideCue: 'inside, a glazed pod open to the garden, planting at the threshold',
		negativeFragment: 'neon, high-rise, crowds, bare gravel, paving, mown lawn',
		lightLine: 'high midday sun falling through the canopy, dappled and open, nothing held in deep shade',
		shadowFace: 'Greenbelt as exclusion; who lives inside the ring'
	}),
	future({
		key: 'arcology',
		name: 'The vertical city',
		provenance: 'Paolo Soleri, Arcology: The City in the Image of Man, 1969',
		blurb: 'One enormous structure holds everything: work, homes, food, transit. You need never go outside.',
		eraDefault: 'hyperfuturistic-2040',
		eraLocked: false,
		eraWarn: [],
		moodLine:
			'One vast continuous interior: a single megastructure canyon of stacked terraces bridging overhead, seen from a mid-level walkway. Board-marked concrete, dark steel, deep planting spilling from every edge. Light falls in enormous shafts from an apex oculus far above, leaving the lower levels in cool blue shadow and warm pooled lamplight. Palette: graphite, moss, amber, dust. Monumental scale; a single small figure dwarfed by structure. No exterior sky, no horizon. Awe with a trace of confinement.',
		styleDna:
			'a vast interior canyon of terraces receding level after level, dwellings, gardens and workrooms throughout',
		worldOutside: 'across the void, homes and planting stacked out of sight; pale concrete, warm timber',
		insideCue: 'inside, a transit car climbing the void, market stalls below',
		negativeFragment: 'suburb, lawns, open sky, brutalist civic building, 1970s office block',
		lightLine: 'daylight pouring down the apex oculus and bouncing off pale concrete into every terrace',
		shadowFace: 'Elysium: the ring above, the ground below'
	}),
	future({
		key: 'solarpunk',
		// NOT "The abundant city". That name and "The garden city" both read as
		// "the green one" on a phone card that shows a name over a picture, and
		// the old blurb admitted it — it opened "A city of plenty, NOT OF
		// WILDERNESS", a disclaimer against being mistaken for its neighbour.
		// A name that needs a disclaimer is the wrong name. What this city
		// actually is, is the one that MAKES what it uses, in public; the
		// garden city is the one that disappears into nature. Those are not
		// confusable, so the blurb no longer has to argue.
		name: 'The self-sufficient city',
		provenance: '"From Steampunk to Solarpunk", 2008 — a design movement, not a film',
		blurb: 'It makes its own energy, food and water, and shows you doing it. Dense and urban \u2014 solar skins, edible facades, pipes and pumps left on display.',
		eraDefault: 'recognisably-2035',
		eraLocked: false,
		eraWarn: [],
		moodLine:
			'A working floor inside a green volume at golden hour; photovoltaic glass canopy, mycelium acoustic panels, reclaimed timber, hemp textiles, visible copper conduit and water channels. Suspended planting pods and edible vines hang between occupied desks with warm task lamps. Light is diffuse, humid, shafts through mist; deep green shadow behind. Palette: leaf, terracotta, brass, teal. Mid-rise, terraced, open to a planted street. Repair and making are visible. Abundant, tended, optimistic.',
		styleDna:
			'copper pipework, water tanks and filtration banks on show, dials and valves, hanging vines, teal and terracotta',
		worldOutside: 'through the glass, photovoltaic canopies, edible facades, trams; reclaimed timber, copper',
		insideCue: 'inside, a filtration bank and gauges beside the desks',
		negativeFragment: 'neon signage, dead plants',
		lightLine: 'sunlight through the photovoltaic canopy, warm patches on timber, green reflected light',
		shadowFace: 'Aesthetic greenwash over unchanged extraction'
	}),
	future({
		key: 'retrofuturism',
		name: 'Neo Retro',
		provenance: 'Deco and Streamline Moderne, c. 1925-1939',
		blurb: 'The more we walk into the future, the more we want the past. Deco geometry, brass, streamlined curves \u2014 a tomorrow built out of yesterday.',
		eraDefault: 'retro-1930s',
		eraLocked: true,
		eraWarn: [],
		moodLine:
			'A 1930s civic interior reborn as a workfloor, evening. Fluted walnut panelling, brass and bakelite fittings, oxblood leather, terrazzo with brass inlay, stepped Deco cornices, milk-glass uplighters, a curved mezzanine balustrade. Light is warm incandescent, low, gathered in pools with the ceiling left dark. Palette: walnut, brass, oxblood, cream. Mid-rise; tall arched windows onto a gaslit street. Craft and weight everywhere, technology hidden inside cabinetry. Generous, tactile, nostalgic.',
		styleDna:
			'streamlined moderne curves, fluted walnut, brass banding, inlaid terrazzo, milk-glass globes, rounded corner windows',
		worldOutside: 'through the glass, a streamlined city of setbacks and spires, an airship; walnut, brass',
		insideCue: 'inside, brass and enamel machines that are obviously advanced computers',
		negativeFragment: 'neon, skyscrapers, museum, antiques, period drama, Victorian',
		lightLine: 'bright daylight through tall windows, walnut and brass lit warm and clear',
		shadowFace: 'Ornament as a screen over the same machine'
	})
];

/**
 * WITHDRAWN LENSES — offered to nobody, resolvable for ever.
 *
 * The 21 Sep review cut the list to the four the room actually discusses.
 * These two are not deleted, because a lens is not an `And:` fragment: it
 * supplies `styleDna`, `worldOutside`, `lightLine` AND `negativeFragment`,
 * so a row stored under one of these keys would compose a prompt missing
 * its entire world layer rather than merely a clause. `futureByKey` reads
 * `ALL_FUTURES`; every screen, the book and the visuals read `FUTURES`.
 *
 * Reinstating one is moving its entry back up into `FUTURES` and bumping
 * the count guard. Nothing else knows the difference.
 */
export const RETIRED_FUTURES: Future[] = [
	future({
		key: 'neo-seoul',
		name: 'The dense and lit city',
		provenance: 'Gibson, Neuromancer, 1984; Neo Seoul 2144 in Cloud Atlas, 2012',
		blurb: 'Vertical, neon, always awake. The corporation is the weather. You work inside the machine.',
		eraDefault: 'hyperfuturistic-2040',
		eraLocked: false,
		eraWarn: [],
		moodLine:
			'Night, high above a vertical megacity. Rain-slick black glass, wet concrete, brushed steel, holographic signage bleeding magenta and cyan across every surface. The workfloor is a narrow lit shelf cantilevered over a canyon of towers and layered traffic. Light is hard, artificial, from below and behind; no daylight anywhere. Palette: near-black, sodium amber, neon magenta, cold cyan. Extreme density, no ground visible. Silhouetted figures, surveillance sightlines. Dazzling, watched, airless.',
		styleDna: 'layered holographic signage, wet chrome and glass, stacked verticality, cyan-magenta accents on dark surfaces',
		worldOutside: 'through the glass, dense towers, layered traffic decks; black glass, brushed steel',
		insideCue: 'inside, holographic signage drifting through the room',
		negativeFragment: 'rural, greenery outside',
		lightLine: 'flat bright daylight off glass and steel, the signage washed pale against a high sky',
		shadowFace: 'It is the shadow'
	}),
	future({
		key: 'broadacre-city',
		name: 'The dispersed city',
		provenance: 'Frank Lloyd Wright, The Disappearing City, 1932',
		blurb: 'No centre at all. An acre each, work wherever the network reaches. The office comes to you.',
		eraDefault: 'recognisably-2035',
		eraLocked: false,
		eraWarn: [],
		moodLine:
			'A single-storey timber work pavilion alone on open land at dusk, mist in the middle distance. Charred larch cladding, stone plinth, deep glazed veranda, a lit hearth inside. Light is low, warm, interior lamplight spilling onto grass against a cooling blue landscape. Palette: char, ember, wet green, fog grey. No skyline at all; the nearest neighbour is a distant roof. One figure at one desk. Autonomous, remote, faintly lonely.',
		styleDna: 'a lone flat-roofed timber pavilion on a stone plinth, charred cladding, full-height glass, a hearth',
		worldOutside: 'through the glass, open grassland to the horizon; charred larch, stone',
		insideCue: 'inside, one screen-wall; a drone landing at the edge',
		negativeFragment: 'skyline, towers, crowds',
		lightLine: 'full sun across open grass and deep into the pavilion through full-height glass',
		shadowFace: 'Ex Machina: isolation sold as autonomy'
	})
];

/** Lookup only — never render this. See `RETIRED_FUTURES` above. */
export const ALL_FUTURES: Future[] = [...FUTURES, ...RETIRED_FUTURES];

// --- Shape guards ------------------------------------------------------------
if (FUTURES.length !== 4) {
	throw new Error(`expected exactly 4 offered futures, got ${FUTURES.length}`);
}
if (new Set(ALL_FUTURES.map((f) => f.key)).size !== ALL_FUTURES.length) {
	throw new Error('future keys must be unique, retired ones included');
}
for (const f of ALL_FUTURES) {
	if (f.eraLocked && f.eraAllowed.length !== 1) {
		throw new Error(`${f.key} is eraLocked but eraAllowed has more than one era`);
	}
	if (!f.eraAllowed.includes(f.eraDefault)) {
		throw new Error(`${f.key}'s eraDefault is not in its own eraAllowed`);
	}
}
