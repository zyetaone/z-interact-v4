/**
 * FUTURE / TONE PALETTE — the "choose your future" first screen (futures.md
 * §1/§3/§5). A future is a worldview a table argues from, never a persona.
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
	/** Feeds prompt.ts's LayerInputs.mood. */
	moodLine: string;
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
	/** This future's 10-term negative list (futures.md §3), already carrying the house terms. */
	negativeFragment: string;
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
export const HOUSE_NEGATIVE = 'no personas, stark white, posed faces, text, watermark';

function future(f: Omit<Future, 'eraAllowed'>): Future {
	return { ...f, eraAllowed: allowedEras({ eraDefault: f.eraDefault, eraLocked: f.eraLocked }) };
}

export const FUTURES: Future[] = [
	future({
		key: 'garden-city',
		name: 'Garden City',
		provenance: 'Ebenezer Howard, To-morrow, 1898',
		blurb: 'Work inside the park. Low, green, walkable; the office dissolves into landscape.',
		eraDefault: 'recognisably-2035',
		eraLocked: false,
		eraWarn: ['same-as-2026'],
		moodLine:
			'Low horizontal pavilions bedded into a planted park at dusk; rammed earth, weathered oak, oxidised bronze, deep eaves. Light is the last warm hour raking sideways through canopy, pooling amber on timber decks while the shade goes blue-green. Palette: moss, bark, ochre, slate. Two storeys maximum, buildings kept below the tree line. The far skyline sits low and soft behind foliage, half dissolved in humid haze. Distant anonymous figures walking gravel paths. Quiet, unhurried, settled.',
		negativeFragment: 'stark white, neon, high-rise, posed faces, text, watermark, chrome, crowds, glare, sterile',
		shadowFace: 'Greenbelt as exclusion; who lives inside the ring'
	}),
	future({
		key: 'arcology',
		name: 'Arcology',
		provenance: 'Paolo Soleri, Arcology: The City in the Image of Man, 1969',
		blurb: 'One structure holds the whole city. Live, work, grow, and never leave.',
		eraDefault: 'hyperfuturistic-2040',
		eraLocked: false,
		eraWarn: [],
		moodLine:
			'One vast continuous interior: a single megastructure canyon of stacked terraces bridging overhead, seen from a mid-level walkway. Board-marked concrete, dark steel, deep planting spilling from every edge. Light falls in enormous shafts from an apex oculus far above, leaving the lower levels in cool blue shadow and warm pooled lamplight. Palette: graphite, moss, amber, dust. Monumental scale; a single small figure dwarfed by structure. No exterior sky, no horizon. Awe with a trace of confinement.',
		negativeFragment: 'stark white, daylight sky, suburb, posed faces, text, watermark, pastel, clutter, lawns, glare',
		shadowFace: 'Elysium: the ring above, the ground below'
	}),
	future({
		key: 'solarpunk',
		name: 'Solarpunk',
		provenance: '"From Steampunk to Solarpunk", 2008 — a design movement, not a film',
		blurb: 'Abundance without extraction. Visible energy, edible facades, repair as a civic craft.',
		eraDefault: 'recognisably-2035',
		eraLocked: false,
		eraWarn: [],
		moodLine:
			'A working floor inside a green volume at golden hour; photovoltaic glass canopy, mycelium acoustic panels, reclaimed timber, hemp textiles, visible copper conduit and water channels. Suspended planting pods and edible vines hang between occupied desks with warm task lamps. Light is diffuse, humid, shafts through mist; deep green shadow behind. Palette: leaf, terracotta, brass, teal. Mid-rise, terraced, open to a planted street. Repair and making are visible. Abundant, tended, optimistic.',
		negativeFragment: 'stark white, neon signage, dead plants, posed faces, text, watermark, sterile, grey, concrete, glare',
		shadowFace: 'Aesthetic greenwash over unchanged extraction'
	}),
	future({
		key: 'neo-seoul',
		name: 'Neo-Seoul / Cyberpunk',
		provenance: 'Gibson, Neuromancer, 1984; Neo Seoul 2144 in Cloud Atlas, 2012',
		blurb: 'Vertical, lit, watched. The corporation is the only weather you work inside.',
		eraDefault: 'hyperfuturistic-2040',
		eraLocked: false,
		eraWarn: [],
		moodLine:
			'Night, high above a vertical megacity. Rain-slick black glass, wet concrete, brushed steel, holographic signage bleeding magenta and cyan across every surface. The workfloor is a narrow lit shelf cantilevered over a canyon of towers and layered traffic. Light is hard, artificial, from below and behind; no daylight anywhere. Palette: near-black, sodium amber, neon magenta, cold cyan. Extreme density, no ground visible. Silhouetted figures, surveillance sightlines. Dazzling, watched, airless.',
		negativeFragment: 'daylight, greenery, stark white, posed faces, text, watermark, warm wood, calm, timber, rural',
		shadowFace: 'It is the shadow'
	}),
	future({
		key: 'broadacre-city',
		name: 'Broadacre City',
		provenance: 'Frank Lloyd Wright, The Disappearing City, 1932',
		blurb: 'No centre at all. An acre each, work wherever the network reaches.',
		eraDefault: 'recognisably-2035',
		eraLocked: false,
		eraWarn: [],
		moodLine:
			'A single-storey timber work pavilion alone on open land at dusk, mist in the middle distance. Charred larch cladding, stone plinth, deep glazed veranda, a lit hearth inside. Light is low, warm, interior lamplight spilling onto grass against a cooling blue landscape. Palette: char, ember, wet green, fog grey. No skyline at all; the nearest neighbour is a distant roof. One figure at one desk. Autonomous, remote, faintly lonely.',
		negativeFragment: 'skyline, crowds, stark white, neon, posed faces, text, watermark, density, towers, glare',
		shadowFace: 'Ex Machina: isolation sold as autonomy'
	}),
	future({
		key: 'retrofuturism',
		name: 'Retrofuturism',
		provenance: "The lead's own Q1 option; Deco and Streamline Moderne, c. 1925-1939",
		blurb: 'Warmth, craft and brass return. The future remembers how rooms once felt.',
		eraDefault: 'retro-1930s',
		eraLocked: true,
		eraWarn: [],
		moodLine:
			'A 1930s civic interior reborn as a workfloor, evening. Fluted walnut panelling, brass and bakelite fittings, oxblood leather, terrazzo with brass inlay, stepped Deco cornices, milk-glass uplighters, a curved mezzanine balustrade. Light is warm incandescent, low, gathered in pools with the ceiling left dark. Palette: walnut, brass, oxblood, cream. Mid-rise; tall arched windows onto a gaslit street. Craft and weight everywhere, technology hidden inside cabinetry. Generous, tactile, nostalgic.',
		negativeFragment: 'stark white, visible screens, minimalism, posed faces, text, watermark, chrome, neon, plastic, glare',
		shadowFace: 'Ornament as a screen over the same machine'
	}),
	future({
		key: 'pragmatist-retrofit',
		name: 'Pragmatist Retrofit',
		provenance: 'No manifesto; the lead\'s Q1 option "deliberately the same as 2026", protected',
		blurb: 'Nothing new. Fix the floor you already have and defend what works.',
		eraDefault: 'same-as-2026',
		eraLocked: true,
		eraWarn: [],
		moodLine:
			'A real 2026 office floor, late afternoon, lights not yet on. Existing grey carpet tile, plasterboard, standard glazing, familiar task chairs, a few added acoustic baffles and plywood phone booths. Light is honest daylight going amber through blinds, long shadows across desks, warm lamps at two occupied workstations. Palette: greige, birch ply, dusty rose, muted olive. Ordinary mid-rise city view. Nothing futuristic. Careful, worn-in, quietly competent.',
		negativeFragment: 'futurism, holograms, stark white, posed faces, text, watermark, robots, neon, atrium, glare',
		shadowFace: 'Severance: the unchanged floor as a sealed one'
	})
];

// --- Shape guards ------------------------------------------------------------
if (FUTURES.length !== 7) {
	throw new Error(`expected exactly 7 futures per futures.md §1, got ${FUTURES.length}`);
}
if (new Set(FUTURES.map((f) => f.key)).size !== FUTURES.length) {
	throw new Error('future keys must be unique');
}
for (const f of FUTURES) {
	if (f.eraLocked && f.eraAllowed.length !== 1) {
		throw new Error(`${f.key} is eraLocked but eraAllowed has more than one era`);
	}
	if (!f.eraAllowed.includes(f.eraDefault)) {
		throw new Error(`${f.key}'s eraDefault is not in its own eraAllowed`);
	}
}
