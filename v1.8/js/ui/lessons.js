// Lesson texts shown when the game starts and when an upgrade is unlocked, in English and Polish.

export const LANGS = [
  { id: 'en', label: 'EN' },
  { id: 'pl', label: 'PL' },
];

export const UI_TEXT = {
  en: { gotIt: 'Got it', next: 'Next', back: 'Back', tryIt: 'Try this', unlocked: 'New in your toolbox', welcome: 'Welcome' },
  pl: { gotIt: 'Jasne', next: 'Dalej', back: 'Wstecz', tryIt: 'Wypróbuj', unlocked: 'Nowość w skrzynce', welcome: 'Witaj' },
};

export const INTRO = {
  en: {
    title: 'Nobody swings a pick here',
    pages: [
      {
        body: 'You own one square of rock and one drone. The drone will not move on its own — it does exactly what your program tells it, one line at a time.\n\nType this into your window and press the play button:',
        code: 'mine()',
        note: 'The drone breaks the ore under it. Stone grows back, so this tile never runs out.',
      },
      {
        body: 'A program runs top to bottom and then stops, so pressing play again is how you dig again. Right now the drone knows two commands, and you can put them in any order:',
        code: 'mine()\nmove(right)\nmine()',
        note: 'move takes a direction: up, down, left or right. Fly off one edge and the drone comes back on the opposite one.',
      },
      {
        body: 'Ore pays for upgrades. Press Esc to open the upgrade screen, buy a bigger island, and your drone will have somewhere to fly. Buy Loops and you can stop pressing play — the drone will repeat by itself.\n\nEvery upgrade you buy teaches you a new command, and a note like this one will explain it.',
      },
    ],
  },
  pl: {
    title: 'Tu nikt nie macha kilofem',
    pages: [
      {
        body: 'Masz jedno pole skały i jednego drona. Dron sam z siebie nie ruszy — robi dokładnie to, co każe mu twój program, linijka po linijce.\n\nWpisz to w swoim okienku i wciśnij przycisk odtwarzania:',
        code: 'mine()',
        note: 'Dron rozbija rudę pod sobą. Kamień odrasta, więc to pole nigdy się nie wyczerpie.',
      },
      {
        body: 'Program wykonuje się od góry do dołu i się kończy, więc żeby kopać dalej, wciskasz odtwarzanie jeszcze raz. Na razie dron zna dwie komendy i możesz je ustawiać w dowolnej kolejności:',
        code: 'mine()\nmove(right)\nmine()',
        note: 'move przyjmuje kierunek: up, down, left albo right. Wylecisz za jedną krawędź, wrócisz z przeciwnej.',
      },
      {
        body: 'Za rudę kupujesz ulepszenia. Wciśnij Esc, żeby otworzyć ekran ulepszeń, kup większą wyspę, a dron będzie miał gdzie latać. Kup Pętle, a przestaniesz klikać odtwarzanie — dron będzie powtarzał sam.\n\nKażde kupione ulepszenie uczy nowej komendy, a notatka taka jak ta ją wyjaśni.',
      },
    ],
  },
};

export const LESSONS = {
  boulder: {
    en: {
      deep: 'A boulder is not ore and never ripens — it is a wall with three hit points. move() into it fails immediately and returns False, but the drone still turns to face it, and that is what lets the next mine() land on the boulder instead of the ground.',
      title: 'A boulder is in the way',
      body: 'That big grey rock blocks the tile. Flying into it does nothing, so break it first: aim at it with a move, then mine three times.',
      code: 'move(right)\nmine()\nmine()\nmine()\nmove(right)',
      note: 'While you face a boulder, can_mine() is True and mine() hits the rock rather than the ore under the drone.',
    },
    pl: {
      deep: 'Głaz nie jest rudą i nigdy nie dojrzewa — to ściana z trzema punktami wytrzymałości. move() w jego stronę od razu zawodzi i zwraca False, ale dron i tak obraca się w jego kierunku, i właśnie dzięki temu kolejne mine() trafia w głaz, a nie w ziemię.',
      title: 'Głaz blokuje drogę',
      body: 'Ten duży szary kamień blokuje pole. Wlecenie w niego nic nie da, więc najpierw go rozbij: wyceluj ruchem, potem kop trzy razy.',
      code: 'move(right)\nmine()\nmine()\nmine()\nmove(right)',
      note: 'Kiedy patrzysz na głaz, can_mine() jest prawdą, a mine() uderza w skałę zamiast w rudę pod dronem.',
    },
  },
  grid: {
    en: { deep: 'Under the hood the island is a grid of numbered tiles. move() changes which tile the drone is on, and nothing else — it does not mine, and it does not care what is there.', title: 'Bigger island', body: 'The island grew. More tiles means more ore, but your drone has to reach them.\n\nMoving takes a direction:', code: 'move(right)\nmine()', note: 'The four directions are up, down, left and right. Fly off one edge and you come back on the opposite one.' },
    pl: { deep: 'Pod spodem wyspa to siatka ponumerowanych pól. move() zmienia tylko to, na którym polu stoi dron — nie kopie i nie sprawdza, co tam jest.', title: 'Większa wyspa', body: 'Wyspa urosła. Więcej pól to więcej rudy, ale dron musi do nich dolecieć.\n\nRuch wymaga kierunku:', code: 'move(right)\nmine()', note: 'Kierunki to up, down, left i right. Wylecisz za jedną krawędź, wrócisz z przeciwnej.' },
  },
  loops: {
    en: { deep: 'A loop is not magic: the program jumps back to the top of the indented block and runs it again. for counts for you and stops on its own, while checks the condition before every round.', title: 'Loops', body: 'Two ways to repeat yourself. Use for when you know how many times, while when you do not.', code: 'for i in range(4):\n    mine()\n    move(right)', note: 'range(4) counts 0, 1, 2, 3 and stops before the 4. while True: runs until you press stop. Both need their lines indented under the colon.' },
    pl: { deep: 'Pętla nie jest magią: program wraca na górę wciętego bloku i wykonuje go jeszcze raz. for liczy za ciebie i sam się zatrzymuje, while sprawdza warunek przed każdym obiegiem.', title: 'Pętle', body: 'Dwa sposoby na powtarzanie. for, gdy wiesz ile razy, while, gdy nie wiesz.', code: 'for i in range(4):\n    mine()\n    move(right)', note: 'range(4) liczy 0, 1, 2, 3 i zatrzymuje się przed 4. while True: działa, aż wciśniesz stop. Obie potrzebują wciętych linii pod dwukropkiem.' },
  },
  vars: {
    en: { deep: 'A variable is a labelled box in memory. Writing trips = trips + 1 reads the old number out of the box, adds one, and puts the result back — which is why the order matters.', title: 'Variables and if', body: 'A variable remembers a value under a name. An if only runs its lines when something is true.', code: 'trips = 0\nwhile True:\n    mine()\n    trips = trips + 1\n    if trips > 10:\n        move(up)', note: 'Use == to compare two things, = to store one.' },
    pl: { deep: 'Zmienna to opisane pudełko w pamięci. Zapis trips = trips + 1 wyjmuje starą liczbę z pudełka, dodaje jeden i wkłada wynik z powrotem — dlatego kolejność ma znaczenie.', title: 'Zmienne i if', body: 'Zmienna pamięta wartość pod nazwą. if wykonuje swoje linie tylko wtedy, gdy coś jest prawdą.', code: 'trips = 0\nwhile True:\n    mine()\n    trips = trips + 1\n    if trips > 10:\n        move(up)', note: 'Do porównania dwóch rzeczy służy ==, do zapamiętania jednej =.' },
  },
  sensors: {
    en: { deep: 'A sensor does not change anything, it only answers a question about the tile right now. The answer can be different a second later, so ask again inside the loop rather than storing it once.', title: 'Sensors', body: 'Now the drone can look before it acts. can_mine() is true only when the ore under it is ripe.', code: 'while True:\n    if can_mine():\n        mine()\n    move(right)', note: 'You also get get_ore(), get_pos_x(), get_pos_y() and get_world_size().' },
    pl: { deep: 'Czujnik niczego nie zmienia, tylko odpowiada na pytanie o pole w tej chwili. Sekundę później odpowiedź może być inna, więc pytaj wewnątrz pętli, zamiast zapamiętać raz.', title: 'Czujniki', body: 'Teraz dron może popatrzeć, zanim zadziała. can_mine() jest prawdą tylko wtedy, gdy ruda pod nim dojrzała.', code: 'while True:\n    if can_mine():\n        mine()\n    move(right)', note: 'Dostajesz też get_ore(), get_pos_x(), get_pos_y() i get_world_size().' },
  },
  print: {
    en: { deep: 'print does not affect the drone at all. It exists so you can see what your program believes is happening — the fastest way to find out why a program does the wrong thing.', title: 'Speech', body: 'print puts a speech bubble over your drone so you can see what your program is thinking. Everyone in the room sees it.', code: 'print("digging")\nmine()\nprint("done")', note: 'Text goes in quotes. Numbers and sensor results do not need them.' },
    pl: { deep: 'print w ogóle nie wpływa na drona. Jest po to, żebyś zobaczył, co twój program uważa za prawdę — najszybszy sposób, żeby zrozumieć, czemu robi nie to, co trzeba.', title: 'Mowa', body: 'print wyświetla dymek nad dronem, żebyś widział, co myśli twój program. Widzą go wszyscy w pokoju.', code: 'print("kopie")\nmine()\nprint("gotowe")', note: 'Tekst wpisujesz w cudzysłowie. Liczby i wyniki czujników go nie potrzebują.' },
  },
  wait: {
    en: { deep: 'wait blocks only your own drone. The rest of the mine keeps running, ore keeps ripening, and the other players keep working while you stand still.', title: 'Patience', body: 'wait pauses the drone without burning an action. Useful when ore needs a moment to ripen.', code: 'while True:\n    mine()\n    wait(0.5)', note: 'The number is in seconds and can have a decimal point.' },
    pl: { deep: 'wait blokuje tylko twojego drona. Reszta kopalni działa dalej, ruda dojrzewa, a inni gracze pracują, kiedy ty stoisz.', title: 'Cierpliwość', body: 'wait wstrzymuje drona bez marnowania akcji. Przydaje się, gdy ruda potrzebuje chwili, żeby dojrzeć.', code: 'while True:\n    mine()\n    wait(0.5)', note: 'Liczba jest w sekundach i może mieć przecinek dziesiętny.' },
  },
  speed: {
    en: { deep: 'Speed changes the time an action takes, not the number of actions. A program that wastes moves stays wasteful — it just wastes them faster.', title: 'Faster rotors', body: 'Every action now takes less time. Nothing changes in your code — the same program simply mines more.', code: 'while True:\n    mine()', note: 'Each level makes moving and mining about 15% quicker.' },
    pl: { deep: 'Prędkość zmienia czas trwania akcji, a nie ich liczbę. Program, który marnuje ruchy, dalej je marnuje — tylko szybciej.', title: 'Szybsze wirniki', body: 'Każda akcja trwa teraz krócej. W kodzie nic się nie zmienia — ten sam program po prostu wykopie więcej.', code: 'while True:\n    mine()', note: 'Każdy poziom przyspiesza ruch i kopanie o jakieś 15%.' },
  },
  coal: {
    en: { deep: 'Ore types differ in three ways: what they are worth, how long they ripen, and whether they come back on their own. Only stone comes back.', title: 'Coal', body: 'Coal is worth two stone and takes longer to ripen. Unlocking it put twelve coal in the bank and planted one seam on the island — that is your seed money, because coal does not grow back on its own. Check what you are standing on before you dig.', code: 'while True:\n    if get_ore() == coal:\n        mine()\n    move(right)', note: 'Ore names are bare words: stone, coal, iron, gold, crystal, none.' },
    pl: { deep: 'Rudy różnią się trzema rzeczami: wartością, czasem dojrzewania i tym, czy wracają same. Sam wraca tylko kamień.', title: 'Węgiel', body: 'Węgiel jest wart dwa kamienie i dłużej dojrzewa. Odblokowanie wrzuciło dwanaście węgla do banku i posadziło jedno złoże na wyspie — to twój kapitał startowy, bo węgiel nie odrasta sam. Sprawdź, na czym stoisz, zanim zaczniesz kopać.', code: 'while True:\n    if get_ore() == coal:\n        mine()\n    move(right)', note: 'Nazwy rud piszesz bez cudzysłowu: stone, coal, iron, gold, crystal, none.' },
  },
  place: {
    en: { deep: 'place is the opposite of mine: it spends ore from the bank to create a seam. Planting something expensive on a tile you never revisit is how you go backwards.', title: 'Planting', body: 'Only stone grows back by itself. Everything else leaves an empty tile, and place puts a new seam there — it costs a little of that same ore.', code: 'while True:\n    if get_ore() == none:\n        place(coal)\n    move(right)', note: 'count(coal) tells you how much you have in the bank.' },
    pl: { deep: 'place jest odwrotnością mine: wydaje rudę z banku, żeby stworzyć złoże. Posadzenie czegoś drogiego na polu, do którego nigdy nie wrócisz, to najprostszy sposób na stratę.', title: 'Sadzenie', body: 'Sam odrasta tylko kamień. Reszta zostawia puste pole, a place zakłada tam nowe złoże — kosztuje trochę tej samej rudy.', code: 'while True:\n    if get_ore() == none:\n        place(coal)\n    move(right)', note: 'count(coal) mówi, ile masz w banku.' },
  },
  scan: {
    en: { deep: 'scan is the only way to find out about a tile without risking the drone. Lava and gas do not warn you — a drone that flies in is gone and restarts its program from line 1.', title: 'Scanner', body: 'scan looks at the neighbouring tile without flying there. Use it to spot lava and gas, which destroy a drone on contact.', code: 'while True:\n    if scan(right) == "lava":\n        move(up)\n    move(right)', note: 'It answers with the ore name, or "boulder", "lava" or "gas".' },
    pl: { deep: 'scan to jedyny sposób, żeby dowiedzieć się czegoś o polu, nie ryzykując drona. Lawa i gaz nie ostrzegają — dron, który tam wleci, ginie i zaczyna program od linii 1.', title: 'Skaner', body: 'scan zagląda na sąsiednie pole, nie lecąc tam. Użyj go, żeby wypatrzyć lawę i gaz, które niszczą drona przy zetknięciu.', code: 'while True:\n    if scan(right) == "lava":\n        move(up)\n    move(right)', note: 'Odpowiada nazwą rudy albo "boulder", "lava", "gas".' },
  },
  iron: {
    en: { deep: 'The neighbour rule is checked while the seam ripens, not when you plant it. Mining away the stone next door quietly freezes the iron beside it.', title: 'Iron', body: 'Iron is worth three stone, but a seam only ripens when a neighbouring tile holds stone or coal. Plan where you plant it.', code: 'if get_ore() == none:\n    place(iron)', note: 'An iron seam with no stone or coal beside it will sit at zero forever.' },
    pl: { deep: 'Zasada sąsiedztwa sprawdzana jest w trakcie dojrzewania, a nie przy sadzeniu. Wykopanie kamienia obok po cichu zatrzymuje żelazo tuż obok.', title: 'Żelazo', body: 'Żelazo jest warte trzy kamienie, ale złoże dojrzewa tylko wtedy, gdy sąsiednie pole ma kamień albo węgiel. Planuj, gdzie je sadzisz.', code: 'if get_ore() == none:\n    place(iron)', note: 'Złoże żelaza bez kamienia lub węgla obok zostanie na zerze na zawsze.' },
  },
  functions: {
    en: { deep: 'A function does not run when you write it. def only remembers the lines under the name; they run when you call the name, and they can run from more than one place.', title: 'Functions', body: 'A function gives a name to a group of lines so you can use them again without copying.', code: 'def sweep_row():\n    for i in range(4):\n        mine()\n        move(right)\n\nwhile True:\n    sweep_row()\n    move(up)', note: 'Define it once with def, then call it by name as many times as you like.' },
    pl: { deep: 'Funkcja nie wykonuje się, kiedy ją piszesz. def tylko zapamiętuje linie pod nazwą; wykonują się, gdy zawołasz nazwę, i można ją wołać z wielu miejsc.', title: 'Funkcje', body: 'Funkcja nadaje nazwę grupie linii, żebyś mógł ich użyć ponownie bez kopiowania.', code: 'def przejedz_rzad():\n    for i in range(4):\n        mine()\n        move(right)\n\nwhile True:\n    przejedz_rzad()\n    move(up)', note: 'Definiujesz raz przez def, potem wołasz po nazwie, ile razy chcesz.' },
  },
  for_loops: {
    en: { deep: 'enumerate hands you the position and the item at once, so you do not have to keep a counter yourself. It is the tidy version of a variable you add one to.', title: 'For loops', body: 'A for loop walks over numbers or over a list, giving you the current one each time round.', code: 'plan = [up, right, down]\nfor i, step in enumerate(plan):\n    move(step)', note: 'range(4) gives 0, 1, 2, 3 — it stops just before the number you wrote.' },
    pl: { deep: 'enumerate podaje naraz pozycję i element, więc nie musisz sam prowadzić licznika. To porządniejsza wersja zmiennej, do której ciągle dodajesz jeden.', title: 'Pętle for', body: 'Pętla for przechodzi po liczbach albo po liście, dając ci za każdym razem bieżący element.', code: 'plan = [up, right, down]\nfor i, step in enumerate(plan):\n    move(step)', note: 'range(4) daje 0, 1, 2, 3 — zatrzymuje się tuż przed podaną liczbą.' },
  },
  lists: {
    en: { deep: 'A list is one name holding many values in a fixed order. The order is the point — it is how you write down a plan the drone follows step by step.', title: 'Lists', body: 'A list holds several values in order. Count positions from zero.', code: 'plan = [right, right, up]\nfor step in plan:\n    mine()\n    move(step)', note: 'len(plan) is how many items it holds, plan[0] is the first one.' },
    pl: { deep: 'Lista to jedna nazwa trzymająca wiele wartości w ustalonej kolejności. Kolejność jest tu sensem — tak zapisujesz plan, który dron wykonuje krok po kroku.', title: 'Listy', body: 'Lista trzyma kilka wartości po kolei. Pozycje liczy się od zera.', code: 'plan = [right, right, up]\nfor krok in plan:\n    mine()\n    move(krok)', note: 'len(plan) to liczba elementów, plan[0] to pierwszy z nich.' },
  },
  dicts: {
    en: { deep: 'A dict trades order for lookup. You cannot ask for the third item, but you can ask what belongs to a key instantly, however big the dict grows.', title: 'Dicts', body: 'A dict looks a value up by a key instead of by position.', code: 'worth = {stone: 1, coal: 2, iron: 3}\nplan = [stone, coal]\nfor ore in plan:\n    value = worth[ore]', note: 'Use the key in square brackets to read a value back out.' },
    pl: { deep: 'Słownik wymienia kolejność na wyszukiwanie. Nie zapytasz o trzeci element, ale natychmiast dowiesz się, co należy do klucza — niezależnie od tego, jak urośnie.', title: 'Słowniki', body: 'Słownik znajduje wartość po kluczu, a nie po pozycji.', code: 'wartosc = {stone: 1, coal: 2, iron: 3}\nplan = [stone, coal]\nfor ruda in plan:\n    ile = wartosc[ruda]', note: 'Klucz w nawiasach kwadratowych odczytuje wartość z powrotem.' },
  },
  drones: {
    en: { deep: 'Both drones run at the same time, sharing one bank and one island. Two programs that assume they are alone will collide, so decide who works where.', title: 'More drones', body: 'spawn_drone starts a second drone running a function of yours, at the same time as your first one.', code: 'def dig():\n    while True:\n        mine()\n\nspawn_drone(dig)\nwhile True:\n    move(right)\n    mine()', note: 'Drones cannot stand on the same tile — one waits for the other to move on.' },
    pl: { deep: 'Oba drony działają równocześnie, dzieląc jeden bank i jedną wyspę. Dwa programy zakładające, że są same, będą sobie wchodzić w drogę — ustal, kto pracuje gdzie.', title: 'Więcej dronów', body: 'spawn_drone uruchamia drugiego drona z twoją funkcją, równolegle do pierwszego.', code: 'def kop():\n    while True:\n        mine()\n\nspawn_drone(kop)\nwhile True:\n    move(right)\n    mine()', note: 'Drony nie mogą stać na tym samym polu — jeden czeka, aż drugi odleci.' },
  },
  gold: {
    en: { deep: 'The drill is a permanent upgrade to every drone, not a tool you carry. Once bought, every mine() on gold works, including drones you spawn later.', title: 'Gold drill', body: 'The drill lets you mine gold, worth five stone. Without it the drone hits the seam and gets nothing.', code: 'if get_ore() == gold:\n    mine()', note: 'You can also place(gold) now, at a price.' },
    pl: { deep: 'Wiertło to trwałe ulepszenie każdego drona, nie narzędzie, które się nosi. Po zakupie każde mine() na złocie działa, także w dronach stworzonych później.', title: 'Wiertło do złota', body: 'Wiertło pozwala kopać złoto warte pięć kamieni. Bez niego dron uderza w złoże i nic z tego nie ma.', code: 'if get_ore() == gold:\n    mine()', note: 'Możesz teraz także place(gold), za odpowiednią cenę.' },
  },
  crystal: {
    en: { deep: 'Crystal is the first ore that punishes a careless loop. mine() with no can_mine() in front of it turns the most valuable seam in the game into nothing.', title: 'Crystal', body: 'Crystal is worth eight stone and shatters into nothing if you mine it early. Always ask first.', code: 'while True:\n    if can_mine():\n        mine()', note: 'can_mine() is false until the crystal is fully grown. Mining anyway wastes the whole seam.' },
    pl: { deep: 'Kryształ to pierwsza ruda, która karze nieostrożną pętlę. mine() bez can_mine() przed nim zamienia najcenniejsze złoże w grze w nic.', title: 'Kryształ', body: 'Kryształ jest wart osiem kamieni i rozpada się w nic, jeśli wykopiesz go za wcześnie. Zawsze najpierw pytaj.', code: 'while True:\n    if can_mine():\n        mine()', note: 'can_mine() jest fałszem, dopóki kryształ nie urośnie. Kopanie mimo to marnuje całe złoże.' },
  },
};
