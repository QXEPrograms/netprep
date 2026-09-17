window.SECTION_HARDWARE = {
  id: 'hardware',
  title: 'Network Hardware and Connectivity',
  short: 'Hardware',
  weight: 15,
  blurb: 'The physical layer: the boxes, cables, and connectors that make everything above them possible.',
  objectives: [
    {
      id: 'hw-common-devices',
      title: 'Common devices: modems, routers, switches',
      image: 'device-chain',
      body: `
        <ul>
          <li><strong>Modem:</strong> turns the internet company's incoming signal into data your equipment understands &mdash; the bridge between your network and the outside world.</li>
          <li><strong>Router:</strong> connects different networks together and directs traffic between them, usually linking your home/office to the internet.</li>
          <li><strong>Switch:</strong> connects several devices within the SAME network, so they can talk to each other directly.</li>
        </ul>
        <p><strong>Remember this:</strong> modem talks to the internet company. Router connects networks together. Switch connects devices within one network. A lot of home boxes squish all three into one!</p>
      `,
      diagram: null,
    },
    {
      id: 'hw-adapters',
      title: 'Network adapters (NIC, virtual, PCIe)',
      image: 'nic-card',
      body: `
        <p>A <strong>NIC</strong> is the little chip that lets a device physically connect to a network &mdash; every wired or Wi-Fi connection needs one, whether it's built in or added later.</p>
        <ul>
          <li><strong>PCIe adapters:</strong> a physical card you plug into a desktop computer when you need a faster or extra connection.</li>
          <li><strong>Virtual NICs:</strong> a "pretend" network card used by virtual computers, so several virtual machines can share one real network card.</li>
        </ul>
      `,
      diagram: null,
    },
    {
      id: 'hw-ethernet-cables',
      title: 'Ethernet cable types (STP, UTP, coaxial)',
      image: 'cable-family',
      body: `
        <ul>
          <li><strong>UTP:</strong> the everyday, cheapest cable most offices use. The wires are twisted together to cut down on interference, but there's no extra shielding.</li>
          <li><strong>STP:</strong> the same idea, but wrapped in an extra metal shield for places with lots of electrical noise, like near big machines.</li>
          <li><strong>Coaxial:</strong> a thick round cable with a wire in the middle wrapped in shielding, still common for cable TV and cable internet.</li>
        </ul>
        <p><strong>Remember this:</strong> extra shielding = STP. Everyday cheapest cable = UTP.</p>
      `,
      diagram: 'cables',
    },
    {
      id: 'hw-fiber',
      title: 'Fiber optic cable types and connectors',
      image: 'fiber-light',
      body: `
        <p><strong>Fiber optic</strong> cable sends data as pulses of LIGHT through a thin glass strand instead of electricity through metal. It's immune to electrical interference and can travel much farther, much faster than copper cable.</p>
        <ul>
          <li><strong>Single-mode fiber:</strong> a super thin strand carrying one beam of light &mdash; used for really long distances, like between cities.</li>
          <li><strong>Multi-mode fiber:</strong> a wider strand carrying several light paths at once &mdash; cheaper, but only good for shorter distances, like inside one building.</li>
        </ul>
        <p><strong>Remember this:</strong> single-mode = long distance. Multi-mode = shorter distance, cheaper.</p>
      `,
      diagram: null,
    },
    {
      id: 'hw-servers',
      title: 'Rack vs blade server infrastructures',
      image: 'rack-vs-blade',
      body: `
        <ul>
          <li><strong>Rack servers:</strong> each server is its own separate box, stacked in a rack. Easy to fix one without touching the others, but takes up more space.</li>
          <li><strong>Blade servers:</strong> thin servers that slide into one shared case, which handles power and cooling for all of them together. Fits WAY more computing power into the same space, but if the shared case has a problem, it can affect everything inside it.</li>
        </ul>
        <p><strong>Remember this:</strong> need to squeeze the most computers into a small space? Blade servers. Want to fix one server easily without bothering the rest? Rack servers.</p>
      `,
      diagram: null,
    },
    {
      id: 'hw-connect-equipment',
      title: 'Equipment needed to connect to the internet',
      image: 'connect-chain',
      body: `
        <p>Here's the full chain, start to finish: the internet company's line comes into the building &rarr; the <strong>modem</strong> decodes the signal &rarr; the <strong>router</strong> directs traffic and connects to your network &rarr; <strong>switches</strong> extend wired connections to more devices &rarr; <strong>access points</strong> spread Wi-Fi around the building. Cables (copper or fiber) physically connect every step.</p>
      `,
      diagram: null,
    },
    {
      id: 'hw-nas-raid',
      title: 'NAS and RAID configurations',
      image: 'disks-stack',
      body: `
        <p><strong>NAS</strong> is a dedicated storage box on the network that lets everyone share files, without needing a whole separate server.</p>
        <p><strong>RAID</strong> combines several hard drives together to work as a team. A few common setups:</p>
        <ul>
          <li><strong>RAID 0:</strong> super fast, but NO backup safety &mdash; if one drive dies, everything is lost.</li>
          <li><strong>RAID 1:</strong> makes a full copy on a second drive, so if one dies, you still have the data.</li>
          <li><strong>RAID 5:</strong> a nice balance of speed, storage space, and safety &mdash; it can survive one drive dying.</li>
        </ul>
        <p><strong>Remember this:</strong> RAID 0 = fast but risky. RAID 1 = safe copy. RAID 5 = balanced. If a question says "can survive one drive failing," it's never RAID 0.</p>
      `,
      diagram: null,
    },
  ],
  questions: [
    {
      id: 'hw-q1', objectiveId: 'hw-common-devices', scenario: false,
      prompt: 'Which device forwards traffic between devices on the same local network using MAC addresses?',
      choices: ['Modem', 'Switch', 'Router', 'Firewall appliance'],
      answer: 1,
      explanation: 'A switch connects devices within one local network and forwards frames using MAC addresses.'
    },
    {
      id: 'hw-q2', objectiveId: 'hw-common-devices', scenario: false,
      prompt: 'Which device is responsible for translating a cable or DSL signal from the ISP into data the local network can use?',
      choices: ['Router', 'Switch', 'Modem', 'Access point'],
      answer: 2,
      explanation: 'The modem is the bridge/translator between the ISP\'s incoming signal and your local network equipment.'
    },
    {
      id: 'hw-q3', objectiveId: 'hw-adapters', scenario: true,
      prompt: 'A hypervisor allows three virtual machines on one physical server to each have their own independent network connection, sharing the one physical NIC. What makes this possible?',
      choices: ['PCIe adapters', 'Virtual NICs', 'Coaxial cabling', 'RAID 5'],
      answer: 1,
      explanation: 'Virtual NICs are software-defined interfaces that let VMs share and use a physical NIC as if each had its own.'
    },
    {
      id: 'hw-q4', objectiveId: 'hw-ethernet-cables', scenario: true,
      prompt: 'A network cable will run near heavy industrial machinery known to generate significant electromagnetic interference. Which cable type is the better choice?',
      choices: ['UTP', 'STP', 'Coaxial only', 'Any cable works equally well here'],
      answer: 1,
      explanation: 'STP (Shielded Twisted Pair) adds shielding specifically to protect against electromagnetic interference, unlike unshielded UTP.'
    },
    {
      id: 'hw-q5', objectiveId: 'hw-ethernet-cables', scenario: false,
      prompt: 'What is the main difference between UTP and STP cabling?',
      choices: ['UTP is fiber-based, STP is copper-based', 'STP has an added shielding layer against interference; UTP does not', 'UTP only works with wireless networks', 'STP cannot be used for Ethernet'],
      answer: 1,
      explanation: 'STP adds a metal shielding layer around the twisted pairs for extra interference protection; UTP omits that shielding, making it cheaper but more interference-prone.'
    },
    {
      id: 'hw-q6', objectiveId: 'hw-fiber', scenario: true,
      prompt: 'An ISP needs to run a fiber connection over many miles between two cities. Which fiber type should it use?',
      choices: ['Multi-mode fiber', 'Single-mode fiber', 'Coaxial cable', 'UTP Cat6'],
      answer: 1,
      explanation: 'Single-mode fiber\'s narrow core supports the long distances needed for backbone/long-haul links, unlike shorter-range multi-mode fiber.'
    },
    {
      id: 'hw-q7', objectiveId: 'hw-fiber', scenario: false,
      prompt: 'Why is fiber optic cable immune to electromagnetic interference in a way copper cable is not?',
      choices: ['It uses light pulses instead of electrical signals', 'It is coated in rubber', 'It only carries data one direction', 'It uses a shorter wavelength than copper'],
      answer: 0,
      explanation: 'Fiber transmits data as light rather than electrical signals, so it is unaffected by the electromagnetic interference that can disrupt copper cabling.'
    },
    {
      id: 'hw-q8', objectiveId: 'hw-servers', scenario: true,
      prompt: 'A datacenter needs to fit as much server compute power as possible into limited rack space, and shares power/cooling infrastructure to save cost. Which server type fits?',
      choices: ['Rack servers', 'Blade servers', 'Desktop towers', 'NAS devices'],
      answer: 1,
      explanation: 'Blade servers share a common chassis for power/cooling/networking, allowing much higher density than standalone rack servers.'
    },
    {
      id: 'hw-q9', objectiveId: 'hw-connect-equipment', scenario: false,
      prompt: 'Put these in the correct order data would pass through when a device sends a request to the internet: switch, modem, router, ISP.',
      choices: ['Switch → Router → Modem → ISP', 'Modem → Switch → Router → ISP', 'ISP → Modem → Router → Switch', 'Router → ISP → Modem → Switch'],
      answer: 0,
      explanation: 'A device connects through a switch to a router, which routes through the modem to reach the ISP and the wider internet.'
    },
    {
      id: 'hw-q10', objectiveId: 'hw-nas-raid', scenario: true,
      prompt: 'A small business wants shared file storage accessible to all employees over the network without setting up a full dedicated server. What should they use?',
      choices: ['NAS', 'A blade chassis', 'A PCIe adapter', 'A modem'],
      answer: 0,
      explanation: 'NAS (Network Attached Storage) is built exactly for this &mdash; dedicated, network-accessible shared storage without a full server.'
    },
    {
      id: 'hw-q11', objectiveId: 'hw-nas-raid', scenario: true,
      prompt: 'A company wants a RAID setup that can survive a single drive failure without losing data, while still using storage space reasonably efficiently. Which RAID level fits best?',
      choices: ['RAID 0', 'RAID 5', 'No RAID, since drives rarely fail', 'RAID 0 with two drives'],
      answer: 1,
      explanation: 'RAID 5 uses distributed parity to survive a single drive failure while using space more efficiently than full mirroring (RAID 1).'
    },
    {
      id: 'hw-q12', objectiveId: 'hw-nas-raid', scenario: false,
      prompt: 'Which RAID level offers zero fault tolerance &mdash; a single drive failure destroys all data on the array?',
      choices: ['RAID 0', 'RAID 1', 'RAID 5', 'RAID 10'],
      answer: 0,
      explanation: 'RAID 0 stripes data across drives purely for speed, with no redundancy &mdash; one drive failing loses everything.'
    },
  ],
};
