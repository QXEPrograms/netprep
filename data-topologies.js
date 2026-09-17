window.SECTION_TOPOLOGIES = {
  id: 'topologies',
  title: 'Network Topologies and Architecture',
  short: 'Topologies',
  weight: 20,
  blurb: 'How networks are shaped and organized &mdash; physically and in the cloud &mdash; and why one layout beats another for a given business.',
  objectives: [
    {
      id: 'topo-p2p-client-server',
      title: 'Peer-to-peer vs client-server',
      image: 'p2p-vs-server',
      body: `
        <p><strong>Peer-to-peer (P2P):</strong> every device is equal &mdash; any computer can share stuff or ask for stuff from any other, with no boss computer in charge. Simple and cheap, but hard to keep safe once you have lots of devices.</p>
        <p><strong>Client-server:</strong> one special computer (the server) holds the files, email, or web pages, and everyone else (the clients) asks it for what they need. Easier to keep organized and safe, and it can handle thousands of people &mdash; but if the server goes down, everyone loses access.</p>
        <p><strong>Remember this:</strong> "3 friends sharing one printer at home" = peer-to-peer. "A whole company logging into one central file server" = client-server.</p>
      `,
      diagram: null,
    },
    {
      id: 'topo-lan-man-wan',
      title: 'LAN, MAN, WAN characteristics',
      image: 'lan-man-wan',
      body: `
        <p>These three are all about how big the area is that a network covers:</p>
        <ul>
          <li><strong>LAN</strong> &mdash; one building. Fast, and owned by one group, like your school.</li>
          <li><strong>MAN</strong> &mdash; a whole city, connecting several LANs together, often using fiber cable owned by the city or an internet company.</li>
          <li><strong>WAN</strong> &mdash; a huge area, like states or whole countries. The internet is the biggest WAN of all! Usually a bit slower since the signal has so far to travel.</li>
        </ul>
        <p><strong>Remember this:</strong> the size order is LAN &lt; MAN &lt; WAN. "Connecting three offices across the whole country" is a WAN.</p>
      `,
      diagram: null,
    },
    {
      id: 'topo-shapes',
      title: 'Topologies: bus, mesh, star, ring &mdash; and when to recommend each',
      image: 'network-shapes',
      body: `
        <p>A topology is just the shape a network is wired in. Here are the four main shapes:</p>
        <ul>
          <li><strong>Bus:</strong> every device shares one long cable. Cheap, but if that cable breaks, everything on it stops working. Not used much anymore.</li>
          <li><strong>Ring:</strong> each device connects to exactly two neighbors, forming a circle. Data travels around the loop.</li>
          <li><strong>Star:</strong> every device connects to one central hub, like spokes on a wheel. This is the shape almost everyone uses today &mdash; if one cable breaks, only that one device loses connection. But if the hub itself breaks, the whole star goes down.</li>
          <li><strong>Mesh:</strong> devices connect to lots of other devices directly, so there are many backup paths. Super reliable, but expensive to wire up. Great for places that can never go offline, like a 911 dispatch center.</li>
        </ul>
        <p><strong>Remember this:</strong> star is the everyday pick (cheap, easy). Mesh is the pick when going offline would be a disaster.</p>
      `,
      diagram: 'topology',
    },
    {
      id: 'topo-wireless-scale',
      title: 'Wireless connectivity options (small vs large-scale)',
      image: 'wifi-coverage',
      body: `
        <p><strong>Small-scale:</strong> one Wi-Fi router covers a home or a small office. Simple to set up, but its signal only reaches so far.</p>
        <p><strong>Large-scale:</strong> a big building uses MANY Wi-Fi access points working together, all managed by one central controller. As you walk around the building, your device smoothly switches from one access point to the next without dropping your connection.</p>
        <p><strong>Remember this:</strong> "walking around a huge building without ever losing Wi-Fi" means there are lots of access points working as a team.</p>
      `,
      diagram: null,
    },
    {
      id: 'topo-cloud-service-models',
      title: 'IaaS, PaaS, SaaS use cases',
      image: 'cloud-layers',
      body: `
        <ul>
          <li><strong>IaaS</strong> &mdash; you rent the raw computer hardware (servers, storage) but you still set everything up yourself. Good for a company that wants full control without buying real hardware.</li>
          <li><strong>PaaS</strong> &mdash; you get a ready-made workshop for building apps, so you just write code and it handles the rest. Good for developers who just want to code.</li>
          <li><strong>SaaS</strong> &mdash; the whole app is already built and ready to use, like Gmail or Google Docs. Good for regular people who just want to use something.</li>
        </ul>
        <p><strong>Remember this:</strong> IaaS &rarr; PaaS &rarr; SaaS, the company that runs it does more and more of the work for you each step.</p>
      `,
      diagram: null,
    },
    {
      id: 'topo-cloud-tradeoffs',
      title: 'Cloud architecture benefits, costs, risks',
      image: 'cloud-scale',
      body: `
        <p><strong>The good stuff:</strong> the cloud can grow instantly when you need more space, you don't have to buy expensive hardware upfront, you can reach it from anywhere, and the company running it handles updates and backups for you.</p>
        <p><strong>The tricky stuff:</strong> monthly fees can add up over time, you need good internet to reach it, and you're trusting someone else to keep your data safe.</p>
        <p><strong>Remember this:</strong> "why would a business be nervous about moving fully to the cloud?" &mdash; the answer is almost always about giving up control or trusting someone else with your data, not just the cost.</p>
      `,
      diagram: null,
    },
    {
      id: 'topo-wireless-factors',
      title: 'Wireless range/speed/reliability factors',
      image: 'wifi-waves',
      body: `
        <p>A few things change how good your Wi-Fi feels:</p>
        <ul>
          <li><strong>Frequency band:</strong> 2.4GHz travels farther through walls but is slower. 5GHz/6GHz is much faster but doesn't travel as far.</li>
          <li><strong>Stuff in the way:</strong> walls, metal, and even other gadgets like microwaves can weaken the signal.</li>
          <li><strong>Distance:</strong> the farther you are from the router, the weaker and slower your connection gets.</li>
          <li><strong>How many devices are connected:</strong> everyone shares the same pipe, so more devices means less speed for each one.</li>
        </ul>
      `,
      diagram: null,
    },
    {
      id: 'topo-5g',
      title: '5G characteristics',
      image: 'tower-speed',
      body: `
        <p>5G is the newest generation of cell phone network. Three big upgrades over the older 4G: it's much <strong>faster</strong>, it has almost no <strong>delay</strong> (great for things that need to react instantly), and it can connect way more devices to one tower at once (helpful for smart gadgets everywhere).</p>
        <p>To get those speeds, 5G uses special short-range radio waves, which means cell companies need to build a lot more towers, closer together.</p>
        <p><strong>Remember this:</strong> if a question says "super low delay" or "tons of connected devices," it's talking about 5G.</p>
      `,
      diagram: null,
    },
  ],
  questions: [
    {
      id: 'topo-q1', objectiveId: 'topo-p2p-client-server', scenario: true,
      prompt: 'Three coworkers in a small home office want to share one printer directly between their laptops with no dedicated server. What network model is this?',
      choices: ['Client-server', 'Peer-to-peer', 'Cloud-based', 'Mesh-managed'],
      answer: 1,
      explanation: 'With no central authority and devices sharing resources directly with each other, this is peer-to-peer.'
    },
    {
      id: 'topo-q2', objectiveId: 'topo-p2p-client-server', scenario: false,
      prompt: 'What is the main drawback of a client-server model compared to peer-to-peer?',
      choices: ['It scales worse as more users are added', 'The server can be a single point of failure', 'It is harder to centrally secure than peer-to-peer', 'It requires every client to also act as a server'],
      answer: 1,
      explanation: 'Centralizing resources on a server improves management, security, and scaling &mdash; the opposite of the first and third options &mdash; but means the server failing can take down access for everyone, unless redundancy is added.'
    },
    {
      id: 'topo-q3', objectiveId: 'topo-lan-man-wan', scenario: false,
      prompt: 'A company connects its offices in New York, Chicago, and Los Angeles into one network. What type of network is this?',
      choices: ['LAN', 'MAN', 'WAN', 'PAN'],
      answer: 2,
      explanation: 'A network spanning cities/states across large distances is a WAN.'
    },
    {
      id: 'topo-q4', objectiveId: 'topo-lan-man-wan', scenario: false,
      prompt: 'A network connecting several city government buildings across a metro area using city-owned fiber is best described as a:',
      choices: ['LAN', 'MAN', 'WAN', 'SAN'],
      answer: 1,
      explanation: 'Spanning a city/metro area (larger than one building, smaller than a WAN) is the definition of a MAN.'
    },
    {
      id: 'topo-q5', objectiveId: 'topo-shapes', scenario: true,
      prompt: 'A small business wants an easy-to-maintain network where one bad cable does not take down every workstation, and cost matters. Which topology fits best?',
      choices: ['Bus', 'Ring', 'Star', 'Full mesh'],
      answer: 2,
      explanation: 'Star topology isolates single-device failures to that device\'s own connection and is inexpensive and easy to manage &mdash; the standard choice for everyday offices.'
    },
    {
      id: 'topo-q6', objectiveId: 'topo-shapes', scenario: true,
      prompt: 'A hospital\'s critical patient-monitoring network must survive any single cable or connection failure without losing communication. Which topology best supports this, despite higher cost?',
      choices: ['Bus', 'Star', 'Mesh', 'Ring'],
      answer: 2,
      explanation: 'Mesh topology provides multiple redundant paths between devices, making it the most fault-tolerant choice for mission-critical uptime, even though it costs more to cable and manage.'
    },
    {
      id: 'topo-q7', objectiveId: 'topo-shapes', scenario: false,
      prompt: 'In a star topology, what happens if the central switch fails?',
      choices: ['Only the closest device loses connectivity', 'Nothing &mdash; star topologies have no single point of failure', 'The entire star segment loses connectivity', 'The network automatically reroutes through a ring'],
      answer: 2,
      explanation: 'Because every device connects only to the central device, that device failing takes down the whole star segment &mdash; its one real weakness.'
    },
    {
      id: 'topo-q8', objectiveId: 'topo-wireless-scale', scenario: false,
      prompt: 'What enables a user to move across a large office building while staying connected to Wi-Fi without dropping their connection?',
      choices: ['A single high-powered router', 'Multiple access points managed centrally with seamless roaming', 'Switching to a wired connection automatically', 'Increasing the subnet mask size'],
      answer: 1,
      explanation: 'Large-scale wireless deployments use multiple coordinated access points so devices can roam between them without losing connection.'
    },
    {
      id: 'topo-q9', objectiveId: 'topo-cloud-service-models', scenario: true,
      prompt: 'A team of developers wants to write and deploy web applications without managing servers or operating systems themselves. Which cloud service model fits?',
      choices: ['IaaS', 'PaaS', 'SaaS', 'DaaS'],
      answer: 1,
      explanation: 'PaaS provides a ready-made platform for building/deploying apps, handling the server and OS layer for the developer.'
    },
    {
      id: 'topo-q10', objectiveId: 'topo-cloud-service-models', scenario: true,
      prompt: 'A small business just wants to use email and document editing tools over the internet, without installing or maintaining any software. Which model is this?',
      choices: ['IaaS', 'PaaS', 'SaaS', 'On-premises'],
      answer: 2,
      explanation: 'Fully finished, ready-to-use software delivered over the internet with nothing to install or manage is SaaS (e.g., Gmail, Google Docs).'
    },
    {
      id: 'topo-q11', objectiveId: 'topo-cloud-tradeoffs', scenario: true,
      prompt: 'A hospital is hesitant to move all patient records fully to a public cloud provider. What is the most likely underlying concern?',
      choices: ['Cloud storage costs less than on-premises hardware', 'Data security, compliance, and loss of direct control over sensitive data', 'The cloud automatically encrypts all stored data', 'Cloud providers offer better redundancy than on-premises servers'],
      answer: 1,
      explanation: 'Regulated industries handling sensitive data often worry about compliance, data residency, and trusting a third party with control over that data. The other options describe real cloud benefits, not reasons to hesitate.'
    },
    {
      id: 'topo-q12', objectiveId: 'topo-wireless-factors', scenario: false,
      prompt: 'Which frequency band generally offers longer range and better wall penetration, at the cost of speed?',
      choices: ['2.4GHz', '5GHz', '6GHz', 'All bands perform identically'],
      answer: 0,
      explanation: '2.4GHz has a longer wavelength, giving it better range and obstacle penetration than 5GHz/6GHz, but with less bandwidth and more congestion.'
    },
    {
      id: 'topo-q13', objectiveId: 'topo-5g', scenario: false,
      prompt: 'Which of the following is a defining characteristic of 5G compared to 4G/LTE?',
      choices: ['Lower device density support', 'Significantly lower latency and higher device density', 'Exclusive use of 2.4GHz frequencies', 'Elimination of the need for cell towers'],
      answer: 1,
      explanation: '5G is defined by much lower latency, higher speeds, and support for far more connected devices per cell &mdash; important for real-time applications and IoT.'
    },
    {
      id: 'topo-q14', objectiveId: 'topo-5g', scenario: false,
      prompt: 'Why does 5G often require more, closer-together cell towers (small cells) than 4G?',
      choices: ['5G only works indoors', 'Higher-frequency millimeter-wave spectrum has shorter range', 'It uses satellite instead of towers', 'Small cells are cheaper to build than large towers'],
      answer: 1,
      explanation: 'The millimeter-wave spectrum 5G uses for its highest speeds has much shorter range, requiring denser tower placement to maintain coverage.'
    },
    {
      id: 'topo-q15', objectiveId: 'topo-cloud-service-models', scenario: true,
      prompt: 'A company wants full control over its operating systems and software stack, but does not want to own or maintain physical servers. Which cloud model fits best?',
      choices: ['IaaS', 'PaaS', 'SaaS', 'On-premises'],
      answer: 0,
      explanation: 'IaaS rents the raw infrastructure (servers, storage, networking) while leaving the OS and everything above it in the customer\'s hands &mdash; the opposite tradeoff from PaaS or SaaS.'
    },
    {
      id: 'topo-q16', objectiveId: 'topo-wireless-factors', scenario: true,
      prompt: 'A coffee shop\'s Wi-Fi feels noticeably slower every afternoon when the most customers are connected, even though nothing else has changed. What is the most likely cause?',
      choices: ['The router\'s firmware needs updating', 'Available bandwidth is being shared across more connected devices', 'The ISP throttles speeds every afternoon', 'The access point has moved to a different frequency band'],
      answer: 1,
      explanation: 'All connected devices share one access point\'s total bandwidth, so more simultaneous users directly means less throughput per device &mdash; the classic afternoon-rush slowdown.'
    },
    {
      id: 'topo-q17', objectiveId: 'topo-shapes', scenario: true,
      prompt: 'A network designer is comparing star and mesh topologies for a mid-size office with a normal (not mission-critical) budget. Which statement best justifies choosing star over mesh here?',
      choices: ['Star topology is more fault-tolerant than mesh', 'Star costs less to cable and manage, and the office can tolerate brief downtime if the hub fails', 'Mesh topology cannot be used in offices', 'Star topology requires no central device'],
      answer: 1,
      explanation: 'Mesh is more fault-tolerant, not star &mdash; but that redundancy costs more in cabling and complexity. For a typical office without mission-critical uptime needs, star\'s lower cost is the deciding factor.'
    },
  ],
};
