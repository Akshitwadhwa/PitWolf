"""Modelled car-mass feature for the overtake classifier.

Regulation rules equalise car-plus-driver mass across teams: the minimum mass
(Car TR C4.1) excludes tyres, and any driver under the 82 kg reference carries
ballast up to it (Car TR C4.5.2). A regulation-derived mass is therefore the
same for every team, and no per-team weight is publicly citable.

So this module models mass as:

    season floor (car, excl. driver/tyres/fuel)
  + nominal tyre set                      (MODELLED, Car TR C Appendix)
  + driver reference mass + ballast       (Car TR C4.5.2, 82 kg)
  + team mass offset                      (MODELLED, editable, default 0)
  + estimated remaining fuel by lap       (MODELLED start load, burns linearly)

The discriminating signal is fuel burning off lap by lap and the season floor;
per-team variance is exactly whatever is entered in TEAM_MASS_OFFSET_KG. Keep
that table at 0 unless a trusted per-team weight source is available.

Historical season floors are derived from published car+driver minimums minus
the 82 kg driver reference; they are approximations and labelled MODELLED.
"""

from fia_2026_regs import CONSTANTS, MINIMUM_TYRE_MASS_KG, MAX_FUEL_START_KG

TYRE_SET_KG = MINIMUM_TYRE_MASS_KG['value']
DRIVER_BALLAST_KG = CONSTANTS['driver_reference_mass_min_kg']['value']
FLOOR_2026_KG = CONSTANTS['minimum_mass_race_kg']['value']

# Car-only floor (excl. driver, tyres, fuel). 2026 is the cited regulation
# value; earlier seasons are published car+driver minimums minus 82 kg.
SEASON_FLOOR_KG = {
    2026: FLOOR_2026_KG,
    2025: 718.0, 2024: 716.0, 2023: 716.0, 2022: 716.0,
    2021: 670.0, 2020: 664.0, 2019: 661.0, 2018: 652.0,
}
DEFAULT_FLOOR_KG = 716.0

# Editable per-team mass offset in kg. Zero = every team at the regulation
# floor, which is what the rules imply. Populate only from a trusted source.
TEAM_MASS_OFFSET_KG = {
    'MER': 0.0, 'FER': 0.0, 'RBR': 0.0, 'MCL': 0.0, 'ALP': 0.0,
    'AST': 0.0, 'WIL': 0.0, 'RB': 0.0, 'SAU': 0.0, 'HAS': 0.0,
}

# season -> team -> driver codes, used only to apply a team offset.
DRIVER_TEAM = {
    2018: {'MER': ['HAM', 'BOT'], 'FER': ['VET', 'RAI'], 'RBR': ['VER', 'RIC'],
           'REN': ['HUL', 'SAI'], 'HAS': ['MAG', 'GRO'], 'MCL': ['ALO', 'VAN'],
           'RPT': ['PER', 'OCO'], 'RB': ['GAS', 'HAR'], 'WIL': ['STR', 'SIR'],
           'SAU': ['LEC', 'ERI']},
    2019: {'MER': ['HAM', 'BOT'], 'FER': ['VET', 'LEC'], 'RBR': ['VER', 'GAS', 'ALB'],
           'REN': ['HUL', 'RIC'], 'HAS': ['MAG', 'GRO'], 'MCL': ['SAI', 'NOR'],
           'RPT': ['PER', 'STR'], 'RB': ['KVY', 'ALB'], 'WIL': ['KUB', 'RUS'],
           'SAU': ['RAI', 'GIO']},
    2020: {'MER': ['HAM', 'BOT', 'RUS'], 'FER': ['VET', 'LEC'], 'RBR': ['VER', 'ALB'],
           'REN': ['RIC', 'OCO'], 'HAS': ['GRO', 'MAG', 'FIT'], 'MCL': ['SAI', 'NOR'],
           'RPT': ['PER', 'STR'], 'RB': ['GAS', 'KVY'], 'WIL': ['RUS', 'LAT', 'AIT'],
           'SAU': ['RAI', 'GIO']},
    2021: {'MER': ['HAM', 'BOT'], 'FER': ['LEC', 'SAI'], 'RBR': ['VER', 'PER'],
           'ALP': ['ALO', 'OCO'], 'HAS': ['SCH', 'MAZ'], 'MCL': ['NOR', 'RIC'],
           'AST': ['VET', 'STR'], 'RB': ['GAS', 'TSU'], 'WIL': ['RUS', 'LAT'],
           'SAU': ['RAI', 'GIO', 'KUB']},
    2022: {'MER': ['HAM', 'RUS'], 'FER': ['LEC', 'SAI'], 'RBR': ['VER', 'PER'],
           'ALP': ['ALO', 'OCO'], 'HAS': ['SCH', 'MAG'], 'MCL': ['NOR', 'RIC'],
           'AST': ['VET', 'STR', 'HUL'], 'RB': ['GAS', 'TSU'], 'WIL': ['ALB', 'LAT'],
           'SAU': ['BOT', 'ZHO']},
    2023: {'MER': ['HAM', 'RUS'], 'FER': ['LEC', 'SAI'], 'RBR': ['VER', 'PER'],
           'ALP': ['ALO', 'OCO'], 'HAS': ['HUL', 'MAG'], 'MCL': ['NOR', 'PIA'],
           'AST': ['ALO', 'STR'], 'RB': ['TSU', 'DEV', 'RIC', 'LAW'],
           'WIL': ['ALB', 'SAR'], 'SAU': ['BOT', 'ZHO']},
    2024: {'MER': ['HAM', 'RUS'], 'FER': ['LEC', 'SAI'], 'RBR': ['VER', 'PER'],
           'ALP': ['GAS', 'OCO'], 'HAS': ['HUL', 'MAG'], 'MCL': ['NOR', 'PIA'],
           'AST': ['ALO', 'STR'], 'RB': ['TSU', 'RIC', 'LAW'],
           'WIL': ['ALB', 'SAR', 'COL'], 'SAU': ['BOT', 'ZHO']},
    2025: {'MER': ['RUS', 'ANT'], 'FER': ['LEC', 'HAM'], 'RBR': ['VER', 'TSU', 'LAW'],
           'MCL': ['NOR', 'PIA'], 'WIL': ['ALB', 'SAI'], 'AST': ['ALO', 'STR'],
           'ALP': ['GAS', 'DOO', 'COL'], 'HAS': ['OCO', 'BEA'],
           'RB': ['LAW', 'HAD'], 'SAU': ['HUL', 'BOR']},
}

_DRIVER_TO_TEAM = {}
for _season, _teams in DRIVER_TEAM.items():
    for _team, _drivers in _teams.items():
        for _code in _drivers:
            _DRIVER_TO_TEAM[(_season, _code)] = _team


def team_of(year, driver):
    return _DRIVER_TO_TEAM.get((int(year), str(driver).upper()))


def fuel_start_kg(year):
    return MAX_FUEL_START_KG.get(int(year), MAX_FUEL_START_KG['default'])['value']


def car_mass_kg(year, driver, lap_fraction):
    """Estimated total car mass (kg) at a point in the race."""
    year = int(year)
    floor = SEASON_FLOOR_KG.get(year, DEFAULT_FLOOR_KG)
    team = team_of(year, driver)
    offset = TEAM_MASS_OFFSET_KG.get(team, 0.0) if team else 0.0
    frac = min(max(float(lap_fraction or 0.0), 0.0), 1.0)
    fuel = fuel_start_kg(year) * (1.0 - frac)
    return floor + TYRE_SET_KG + DRIVER_BALLAST_KG + offset + fuel


def mass_features(row):
    """attackerMassKg / defenderMassKg / massDeltaKg for a decision-point row."""
    a = car_mass_kg(row.get('year'), row.get('driver'), row.get('lapFraction'))
    d = car_mass_kg(row.get('year'), row.get('defender'), row.get('lapFraction'))
    return {'attackerMassKg': round(a, 1),
            'defenderMassKg': round(d, 1),
            'massDeltaKg': round(a - d, 1)}
