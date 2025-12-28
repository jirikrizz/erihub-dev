<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Modules\Shoptet\Http\Controllers\PluginAdminController;
use Modules\Shoptet\Models\Shop;

require __DIR__.'/../vendor/autoload.php';

$app = require __DIR__.'/../bootstrap/app.php';
/** @var Kernel $kernel */
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();

$options = getopt('', ['report', 'shops']);

if (isset($options['shops'])) {
    foreach (Shop::select('id', 'name', 'domain', 'timezone')->orderBy('id')->get() as $shop) {
        printf("%d | %s | %s | %s\n", $shop->id, $shop->name, $shop->domain, $shop->timezone);
    }

    exit(0);
}

if (isset($options['report'])) {
    $plugins = \Modules\Shoptet\Models\ShoptetPlugin::with('shop', 'latestVersion')
        ->where('name', 'like', '%Advent%')
        ->get();

    foreach ($plugins as $plugin) {
        $domain = $plugin->shop ? $plugin->shop->domain : '?';
        $version = $plugin->latestVersion ? $plugin->latestVersion->version : 'n/a';
        $bundle = $plugin->latestVersion ? $plugin->latestVersion->bundle_key : 'main';
        echo sprintf("%s | %s | bundle %s | ver %s\n", $domain, $plugin->name, $bundle, $version);
    }

    exit(0);
}

function escapeText(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function buildHtmlBlock(string $dateLabel, string $headline, string $body, array $highlights = [], array $notes = []): string
{
    $html = '<div class="kv-advent-rich">';
    $html .= '<p style="letter-spacing:0.1em;text-transform:uppercase;font-size:0.85rem;margin-bottom:4px;color:rgba(255,255,255,0.75);">'.escapeText($dateLabel).'</p>';
    $html .= '<h3 style="font-size:1.3rem;margin-bottom:8px;">'.escapeText($headline).'</h3>';
    if ($body !== '') {
        $html .= '<p>'.escapeText($body).'</p>';
    }

    if ($highlights !== []) {
        $html .= '<ul>';
        foreach ($highlights as $highlight) {
            $html .= '<li><strong>'.escapeText($highlight['label']).':</strong> '.escapeText($highlight['text']).'</li>';
        }
        $html .= '</ul>';
    }

    if ($notes !== []) {
        $html .= '<p style="font-size:0.9rem;color:rgba(255,255,255,0.8);">'.escapeText(implode(' · ', $notes)).'</p>';
    }

    $html .= '</div>';

    return $html;
}

function buildDays(array $schedule, array $targets): array
{
    $days = [];

    foreach ($schedule as $dayNumber => $data) {
        $days[] = [
            'day' => $dayNumber,
            'title' => $data['headline'],
            'targets' => $targets,
            'html' => buildHtmlBlock(
                $data['date'],
                $data['headline'],
                $data['body'],
                $data['highlights'] ?? [],
                $data['notes'] ?? []
            ),
        ];
    }

    return $days;
}

$czSchedule = [
    1 => [
        'date' => 'Pondělí 1. prosince',
        'headline' => 'Přichystejte se na Ježíška',
        'body' => 'Startujeme velkou vánoční jízdu s krabičkami plnými radosti.',
        'highlights' => [
            ['label' => 'Web', 'text' => '15 % sleva na dárkové sady'],
            ['label' => 'App', 'text' => '20 % sleva v aplikaci'],
        ],
    ],
    2 => [
        'date' => 'Úterý 2. prosince',
        'headline' => 'Rozdáváme 2 000 Kč',
        'body' => 'Každá objednávka se zapojuje do losování o 4 poukazy v hodnotě 500 Kč.',
    ],
    3 => [
        'date' => 'Středa 3. prosince',
        'headline' => 'Alcampo Brisa Suave v akci',
        'body' => 'Ikonická vůně až o 70 % levněji v aplikaci.',
        'highlights' => [
            ['label' => 'Web', 'text' => '60 % sleva'],
            ['label' => 'App', 'text' => '70 % sleva'],
        ],
    ],
    4 => [
        'date' => 'Čtvrtek 4. prosince',
        'headline' => 'Elite den pro Saphir',
        'body' => 'Dopřejte si prémiovou kolekci s extra zvýhodněním.',
        'highlights' => [
            ['label' => 'Web', 'text' => '15 % sleva na Saphir Elite'],
            ['label' => 'App', 'text' => '20 % sleva v aplikaci'],
        ],
    ],
    5 => [
        'date' => 'Pátek 5. prosince',
        'headline' => 'Parfémy na praní',
        'body' => 'Provoněná domácnost se slevovým kódem na celý sortiment.',
        'highlights' => [
            ['label' => 'Web', 'text' => '15 % sleva'],
            ['label' => 'App', 'text' => '20 % sleva'],
        ],
    ],
    6 => [
        'date' => 'Sobota 6. prosince',
        'headline' => 'PURE No. 223',
        'body' => 'Nejoblíbenější čistá vůně za polovinu.',
        'highlights' => [
            ['label' => 'Web', 'text' => '50 % sleva'],
            ['label' => 'App', 'text' => '60 % sleva'],
        ],
    ],
    7 => [
        'date' => 'Neděle 7. prosince',
        'headline' => 'Gábina Kostohryzová – launch',
        'body' => 'Ke každému parfému do 12. 12. přidáme rozprašovač zdarma.',
    ],
    8 => [
        'date' => 'Pondělí 8. prosince',
        'headline' => 'Doprava zdarma s kódem',
        'body' => 'Bez starostí nad 699 Kč na webu, v aplikaci už od 499 Kč.',
    ],
    9 => [
        'date' => 'Úterý 9. prosince',
        'headline' => 'Dominika Myslivcová – release day',
        'body' => 'Limitovaný rozprašovač zdarma k nákupu do 12. 12.',
    ],
    10 => [
        'date' => 'Středa 10. prosince',
        'headline' => 'Saphir Unique Wish',
        'body' => 'Kultovní vůně s adventní slevou pro všechny varianty.',
        'highlights' => [
            ['label' => 'Web', 'text' => '25 % sleva'],
            ['label' => 'App', 'text' => '30 % sleva'],
        ],
    ],
    11 => [
        'date' => 'Čtvrtek 11. prosince',
        'headline' => 'Rozdáváme 4 000 Kč',
        'body' => '4× 1 000 Kč pro zákazníky, kteří dnes nakoupí.',
    ],
    12 => [
        'date' => 'Pátek 12. prosince',
        'headline' => 'Mystery kódy',
        'body' => 'Schovali jsme 10 kódů: 5× 30 % pro web a 5× 35 % v aplikaci.',
    ],
    13 => [
        'date' => 'Sobota 13. prosince',
        'headline' => 'Vůně do auta',
        'body' => 'Vybrané segmenty získají 15 % slevu bez kódu.',
    ],
    14 => [
        'date' => 'Neděle 14. prosince',
        'headline' => 'Night Shopping',
        'body' => 'Ve 20:00 odemykáme kód -20 % pro 100 nejrychlejších.',
    ],
    15 => [
        'date' => 'Pondělí 15. prosince',
        'headline' => 'Doprava zdarma bez kódu',
        'body' => 'Web nad 999 Kč, aplikace nad 699 Kč.',
    ],
    16 => [
        'date' => 'Úterý 16. prosince',
        'headline' => 'App only day',
        'body' => 'Na webu pauza, v aplikaci -20 % na vše.',
    ],
    17 => [
        'date' => 'Středa 17. prosince',
        'headline' => 'Saphir Vida',
        'body' => 'Zvýhodněné varianty 50 i 200 ml.',
        'highlights' => [
            ['label' => 'Web', 'text' => '25 % sleva'],
            ['label' => 'App', 'text' => '30 % sleva'],
        ],
    ],
    18 => [
        'date' => 'Čtvrtek 18. prosince',
        'headline' => 'UNIQ ELIXIR',
        'body' => 'Prémiové parfémy se speciálním zvýhodněním.',
        'highlights' => [
            ['label' => 'Web', 'text' => '15 % sleva'],
            ['label' => 'App', 'text' => '20 % sleva'],
        ],
    ],
    19 => [
        'date' => 'Pátek 19. prosince',
        'headline' => 'Garance doručení',
        'body' => 'Poslední den garantujeme doručení do Štědrého dne. PPL box za 39 Kč.',
    ],
    20 => [
        'date' => 'Sobota 20. prosince',
        'headline' => 'Koupelové bomby',
        'body' => 'Zvýhodněné relaxační sety pro dlouhé večery.',
        'highlights' => [
            ['label' => 'Web', 'text' => '25 % sleva'],
            ['label' => 'App', 'text' => '30 % sleva'],
        ],
    ],
    21 => [
        'date' => 'Neděle 21. prosince',
        'headline' => 'Saphir Cool',
        'body' => 'Ikona 50 i 200 ml s adventní slevou.',
        'highlights' => [
            ['label' => 'Web', 'text' => '20 % sleva'],
            ['label' => 'App', 'text' => '25 % sleva'],
        ],
    ],
    22 => [
        'date' => 'Pondělí 22. prosince',
        'headline' => 'Bonus po Novém roce',
        'body' => 'Nakupte dnes a v lednu posíláme kód -30 % na další objednávku.',
    ],
    23 => [
        'date' => 'Úterý 23. prosince',
        'headline' => 'Rozdáváme 6 000 Kč',
        'body' => '4× 1 500 Kč poukaz pro zákazníky, kteří dnes nakoupí.',
    ],
    24 => [
        'date' => 'Středa 24. prosince',
        'headline' => 'Štědrý den',
        'body' => 'Last minute překvapení: 15 % sleva na dárkové poukazy s kódem.',
    ],
];

$skSchedule = [
    1 => [
        'date' => 'Pondelok 1. decembra',
        'headline' => 'Priprav sa na Ježiška',
        'body' => 'Štartujeme veľkú vianočnú jazdu s balíčkami plnými radosti.',
        'highlights' => [
            ['label' => 'Web', 'text' => '15 % zľava na darčekové sady'],
            ['label' => 'App', 'text' => '20 % zľava v aplikácii'],
        ],
    ],
    2 => [
        'date' => 'Utorok 2. decembra',
        'headline' => 'Rozdávame 2 000 €',
        'body' => 'Každá objednávka sa zapája do žrebovania o 4 poukazy v hodnote 500 €.',
    ],
    3 => [
        'date' => 'Streda 3. decembra',
        'headline' => 'Alcampo Brisa Suave v akcii',
        'body' => 'Ikonická vôňa až o 70 % výhodnejšie v aplikácii.',
        'highlights' => [
            ['label' => 'Web', 'text' => '60 % zľava'],
            ['label' => 'App', 'text' => '70 % zľava'],
        ],
    ],
    4 => [
        'date' => 'Štvrtok 4. decembra',
        'headline' => 'Elite deň pre Saphir',
        'body' => 'Dopraj si prémiovú kolekciu s extra zvýhodnením.',
        'highlights' => [
            ['label' => 'Web', 'text' => '15 % zľava na Saphir Elite'],
            ['label' => 'App', 'text' => '20 % zľava v aplikácii'],
        ],
    ],
    5 => [
        'date' => 'Piatok 5. decembra',
        'headline' => 'Parfémy na pranie',
        'body' => 'Prevoniavame domácnosť so špeciálnym kupónom na celý sortiment.',
        'highlights' => [
            ['label' => 'Web', 'text' => '15 % zľava'],
            ['label' => 'App', 'text' => '20 % zľava'],
        ],
    ],
    6 => [
        'date' => 'Sobota 6. decembra',
        'headline' => 'PURE No. 223',
        'body' => 'Najobľúbenejšia čistá vôňa za polovicu.',
        'highlights' => [
            ['label' => 'Web', 'text' => '50 % zľava'],
            ['label' => 'App', 'text' => '60 % zľava'],
        ],
    ],
    7 => [
        'date' => 'Nedeľa 7. decembra',
        'headline' => 'Gábina Kostohryzová – launch',
        'body' => 'Ku každému parfému do 12. 12. pridáme rozprašovač zdarma.',
    ],
    8 => [
        'date' => 'Pondelok 8. decembra',
        'headline' => 'Caroline Michalčík – premiéra',
        'body' => 'Každý nákup do 12. 12. s limitovaným rozprašovačom ako darčekom.',
        'notes' => ['Doprava zdarma: web nad €30, app nad €20'],
    ],
    9 => [
        'date' => 'Utorok 9. decembra',
        'headline' => 'René – release day',
        'body' => 'Exkluzívna edícia na SK e-shope s darčekom k nákupu.',
    ],
    10 => [
        'date' => 'Streda 10. decembra',
        'headline' => 'Zuzana Plačková – Sugar Mommy',
        'body' => 'Novinka Sugar Mommy s adventným darčekom pre prvé objednávky.',
    ],
    11 => [
        'date' => 'Štvrtok 11. decembra',
        'headline' => 'Rozdávame 4 000 €',
        'body' => 'Štyri poukazy v hodnote 1 000 € pre zákazníkov, ktorí dnes nakúpia.',
    ],
    12 => [
        'date' => 'Piatok 12. decembra',
        'headline' => 'Mystery kódy',
        'body' => 'Skryli sme 10 jednorazových kódov – 5× 30 % pre web a 5× 35 % v appke.',
    ],
    13 => [
        'date' => 'Sobota 13. decembra',
        'headline' => 'Vône do auta',
        'body' => 'Celá kategória so zľavou 15 % bez kódu.',
    ],
    14 => [
        'date' => 'Nedeľa 14. decembra',
        'headline' => 'Night Shopping',
        'body' => 'O 20:00 odomykáme kód -20 % na všetko pre 100 najrýchlejších.',
    ],
    15 => [
        'date' => 'Pondelok 15. decembra',
        'headline' => 'Doprava zdarma bez kódu',
        'body' => 'Web nad €40, aplikácia nad €30.',
    ],
    16 => [
        'date' => 'Utorok 16. decembra',
        'headline' => 'APP Only Day',
        'body' => 'Na webe pauza, v appke -20 % na všetko.',
    ],
    17 => [
        'date' => 'Streda 17. decembra',
        'headline' => 'Saphir Vida',
        'body' => 'Zvýhodnené balenia 50 aj 200 ml.',
        'highlights' => [
            ['label' => 'Web', 'text' => '25 % zľava'],
            ['label' => 'App', 'text' => '30 % zľava'],
        ],
    ],
    18 => [
        'date' => 'Štvrtok 18. decembra',
        'headline' => 'UNIQ ELIXIR',
        'body' => 'Prémiové parfémy so špeciálnym zvýhodnením.',
        'highlights' => [
            ['label' => 'Web', 'text' => '15 % zľava'],
            ['label' => 'App', 'text' => '20 % zľava'],
        ],
    ],
    19 => [
        'date' => 'Piatok 19. decembra',
        'headline' => 'Garancia doručenia',
        'body' => 'Posledný deň garantujeme doručenie do Vianoc. Balíkobox za 39 Kč / 1,50 €.',
    ],
    20 => [
        'date' => 'Sobota 20. decembra',
        'headline' => 'Kúpeľové bomby',
        'body' => 'Relaxačné sety s adventnou zľavou.',
        'highlights' => [
            ['label' => 'Web', 'text' => '25 % zľava'],
            ['label' => 'App', 'text' => '30 % zľava'],
        ],
    ],
    21 => [
        'date' => 'Nedeľa 21. decembra',
        'headline' => 'Saphir Cool',
        'body' => 'Ikonické balenia 50 aj 200 ml so zľavou až 25 %.',
        'highlights' => [
            ['label' => 'Web', 'text' => '20 % zľava'],
            ['label' => 'App', 'text' => '25 % zľava'],
        ],
    ],
    22 => [
        'date' => 'Pondelok 22. decembra',
        'headline' => 'Bonus po Novom roku',
        'body' => 'Nakúp dnes a v januári ti pošleme kód -30 % na ďalšiu objednávku.',
    ],
    23 => [
        'date' => 'Utorok 23. decembra',
        'headline' => 'Rozdávame 6 000 €',
        'body' => '4× 1 500 € poukaz pre zákazníkov, ktorí dnes nakúpia.',
    ],
    24 => [
        'date' => 'Streda 24. decembra',
        'headline' => 'Štedrý deň',
        'body' => 'Last minute darček: 15 % zľava na darčekové poukazy s kódom.',
    ],
];

function buildWeeklySchedule(array $baseTexts, array $dayNames, string $monthLabel): array
{
    $schedule = [];
    $start = new DateTimeImmutable('2025-12-01');

    for ($i = 1; $i <= 24; $i++) {
        $date = $start->add(new DateInterval('P'.($i - 1).'D'));
        $dayName = $dayNames[(int) $date->format('N')] ?? 'Den '.$i;
        $dateLabel = sprintf('%s %d. %s', $dayName, (int) $date->format('j'), $monthLabel);

        $block = $baseTexts[$i] ?? [
            'headline' => 'Adventní překvapení',
            'body' => 'Sezónní zvýhodnění na vybrané produkty.',
        ];

        $schedule[$i] = [
            'date' => $dateLabel,
            'headline' => $block['headline'],
            'body' => $block['body'],
            'highlights' => $block['highlights'] ?? [],
            'notes' => $block['notes'] ?? [],
        ];
    }

    return $schedule;
}

$dayNamesHu = [
    1 => 'Hétfő',
    2 => 'Kedd',
    3 => 'Szerda',
    4 => 'Csütörtök',
    5 => 'Péntek',
    6 => 'Szombat',
    7 => 'Vasárnap',
];
$dayNamesRo = [
    1 => 'Luni',
    2 => 'Marți',
    3 => 'Miercuri',
    4 => 'Joi',
    5 => 'Vineri',
    6 => 'Sâmbătă',
    7 => 'Duminică',
];
$dayNamesHr = [
    1 => 'Ponedjeljak',
    2 => 'Utorak',
    3 => 'Srijeda',
    4 => 'Četvrtak',
    5 => 'Petak',
    6 => 'Subota',
    7 => 'Nedjelja',
];

$huTexts = [];
foreach (range(1, 6) as $day) {
    $huTexts[$day] = [
        'headline' => 'Adventi meglepetés',
        'body' => 'Minden nap új ajánlat a legnépszerűbb illatokra.',
    ];
}
$huTexts[7] = [
    'headline' => 'Ingyenes szállítás',
    'body' => '899 Kč (~13 500 HUF) feletti rendelésnél kupon nélkül.',
];
foreach (range(8, 14) as $day) {
    $huTexts[$day] = [
        'headline' => '17% kedvezmény minden parfümre',
        'body' => 'Használd az adventi kuponkódot a kosárban.',
    ];
}
foreach (range(15, 21) as $day) {
    $huTexts[$day] = [
        'headline' => 'Ingyenes szállítás kuponnal',
        'body' => '699 Kč (~10 500 HUF) felett, csak ezen a héten.',
    ];
}
foreach (range(22, 24) as $day) {
    $huTexts[$day] = [
        'headline' => 'Ajándékkártya -15%',
        'body' => 'Utolsó pillanatos meglepetés érvényes kóddal.',
    ];
}

$roTexts = [];
foreach (range(1, 6) as $day) {
    $roTexts[$day] = [
        'headline' => 'Surprize de Advent',
        'body' => 'Descoperă mini reduceri la cele mai iubite parfumuri.',
    ];
}
$roTexts[7] = [
    'headline' => 'Transport gratuit',
    'body' => 'Pentru comenzi peste 899 Kč (~170 RON) fără cod.',
];
foreach (range(8, 14) as $day) {
    $roTexts[$day] = [
        'headline' => 'Reducere 17 %',
        'body' => 'Toate parfumurile cu un singur cod promoțional.',
    ];
}
foreach (range(15, 21) as $day) {
    $roTexts[$day] = [
        'headline' => 'Transport gratuit cu cod',
        'body' => 'Peste 699 Kč (~130 RON) în perioada 15 – 21 decembrie.',
    ];
}
foreach (range(22, 24) as $day) {
    $roTexts[$day] = [
        'headline' => 'Carduri cadou -15 %',
        'body' => 'Ultima șansă pentru cadouri digitale.',
    ];
}

$hrTexts = [];
foreach (range(1, 6) as $day) {
    $hrTexts[$day] = [
        'headline' => 'Adventska toplina',
        'body' => 'Svaki dan nova ponuda za omiljene mirise.',
    ];
}
$hrTexts[7] = [
    'headline' => 'Besplatna dostava',
    'body' => 'Narudžbe iznad 899 Kč (~€36) bez koda.',
];
foreach (range(8, 14) as $day) {
    $hrTexts[$day] = [
        'headline' => 'Popust 17 % na parfeme',
        'body' => 'Unesi blagdanski kod u košarici.',
    ];
}
foreach (range(15, 21) as $day) {
    $hrTexts[$day] = [
        'headline' => 'Besplatna dostava uz kod',
        'body' => 'Za narudžbe iznad 699 Kč (~€28).',
    ];
}
foreach (range(22, 24) as $day) {
    $hrTexts[$day] = [
        'headline' => 'Darovne kartice -15 %',
        'body' => 'Idealno rješenje za zadnje dane prije Božića.',
    ];
}

$plans = [
    'krasnevune.cz' => [
        'name' => 'Adventní kalendář 2025 · Česko',
        'bundle' => 'main',
        'timezone' => 'Europe/Prague',
        'decor' => 'gingerbread',
        'snow' => true,
        'countdown' => true,
        'card_label' => 'Adventní okénko',
        'countdown_prefix' => 'Další překvapení za',
        'countdown_complete' => 'Další okénko je připraveno!',
        'targets' => ['/', '/adventni-kalendar'],
        'days' => buildDays($czSchedule, ['/', '/adventni-kalendar']),
    ],
    'krasnevone.sk' => [
        'name' => 'Adventný kalendár 2025 · Slovensko',
        'bundle' => 'main',
        'timezone' => 'Europe/Bratislava',
        'decor' => 'gingerbread',
        'snow' => true,
        'countdown' => true,
        'card_label' => 'Adventné okienko',
        'countdown_prefix' => 'Ďalšie prekvapenie za',
        'countdown_complete' => 'Nové okienko je pripravené!',
        'targets' => ['/', '/adventny-kalendar'],
        'days' => buildDays($skSchedule, ['/', '/adventny-kalendar']),
    ],
    'parfumeshop.hu' => [
        'name' => 'Adventi naptár 2025 · Magyarország',
        'bundle' => 'main',
        'timezone' => 'Europe/Budapest',
        'decor' => 'frost',
        'snow' => false,
        'countdown' => true,
        'card_label' => 'Adventi ablak',
        'countdown_prefix' => 'Következő meglepetésig',
        'countdown_complete' => 'Az új ablak készen áll!',
        'targets' => ['/', '/advent'],
        'days' => buildDays(buildWeeklySchedule($huTexts, $dayNamesHu, 'december'), ['/', '/advent']),
    ],
    'parfumeshop.ro' => [
        'name' => 'Calendar de Advent 2025 · România',
        'bundle' => 'main',
        'timezone' => 'Europe/Bucharest',
        'decor' => 'classic',
        'snow' => false,
        'countdown' => true,
        'card_label' => 'Fereastra de Advent',
        'countdown_prefix' => 'Următoarea surpriză în',
        'countdown_complete' => 'Următorul cadou este pregătit!',
        'targets' => ['/', '/calendar-advent'],
        'days' => buildDays(buildWeeklySchedule($roTexts, $dayNamesRo, 'decembrie'), ['/', '/calendar-advent']),
    ],
    'parfumshop.hr' => [
        'name' => 'Adventski kalendar 2025 · Hrvatska',
        'bundle' => 'main',
        'timezone' => 'Europe/Zagreb',
        'decor' => 'classic',
        'snow' => false,
        'countdown' => true,
        'card_label' => 'Adventsko prozorče',
        'countdown_prefix' => 'Sljedeće iznenađenje za',
        'countdown_complete' => 'Novo prozorče je spremno!',
        'targets' => ['/', '/advent'],
        'days' => buildDays(buildWeeklySchedule($hrTexts, $dayNamesHr, 'prosinca'), ['/', '/advent']),
    ],
];

$controller = app(PluginAdminController::class);
$startDate = '2025-12-01';

foreach ($plans as $domain => $config) {
    /** @var Shop|null $shop */
    $shop = Shop::query()->where('domain', $domain)->first();
    if (! $shop) {
        echo "• Shop with domain {$domain} not found, skipping.\n";
        continue;
    }

    $payload = [
        'shop_id' => $shop->id,
        'name' => $config['name'],
        'bundle_key' => $config['bundle'],
        'start_date' => $startDate,
        'timezone' => $config['timezone'],
        'decor_variant' => $config['decor'],
        'enable_snowfall' => $config['snow'],
        'show_countdown' => $config['countdown'],
        'card_label' => $config['card_label'] ?? null,
        'countdown_prefix' => $config['countdown_prefix'] ?? null,
        'countdown_complete' => $config['countdown_complete'] ?? null,
        'days' => $config['days'],
    ];

    $request = Request::create('/internal/advent', 'POST', $payload);
    $response = $controller->storeAdventCalendar($request);

    if ($response->getStatusCode() >= 400) {
        echo "• {$domain}: error {$response->getStatusCode()} {$response->getContent()}\n";
        continue;
    }

    echo "• {$domain}: ".$response->getContent()."\n";
}
