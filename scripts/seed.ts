/**
 * Cortex demo seed — rich, realistic data so every screen feels alive.
 * Run: bun scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DAY = 86_400_000
const now = new Date()
const daysAgo = (n: number, h = 9) => new Date(now.getTime() - n * DAY - h * 3_600_000)
const daysAhead = (n: number, h = 9) => new Date(now.getTime() + n * DAY + h * 3_600_000)
const todayAt = (h: number) => {
  const d = new Date()
  d.setHours(h, 0, 0, 0)
  return d
}

const TRANSFORMER_CONTENT = `The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.

Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles, by over 2 BLEU. On the WMT 2014 English-to-French translation task, our model establishes a new single-model state of the art BLEU score of 41.8 after training for 3.5 days on eight GPUs, a small fraction of the training costs of the best models from the literature.

We show that the Transformer generalizes well to other tasks by applying it successfully to English constituency parsing both with large and limited training data.

Recurrent neural networks, long short-term memory and gated recurrent neural networks in particular, have been firmly established as state of the art approaches in sequence modeling and transduction problems such as language modeling and machine translation. Numerous efforts have since continued to push the boundaries of recurrent language models and encoder-decoder architectures.

Attention mechanisms have become an integral part of compelling sequence modeling and transduction models in various tasks, allowing modeling of dependencies without regard to their distance in the input or output. In all but a few cases, however, such attention mechanisms are used in conjunction with a recurrent network.

The Transformer, for the first time, dispenses with recurrence entirely and relies exclusively on self-attention to compute representations of its input and output. Self-attention, sometimes called intra-attention, is an attention mechanism relating different positions of a single sequence in order to compute a representation of the sequence. Self-attention has been used successfully in a variety of tasks including reading comprehension, abstractive summarization, textual entailment and learning task-independent sentence representations.

The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder. The encoder is composed of a stack of N = 6 identical layers. Each layer has two sub-layers. The first is a multi-head self-attention mechanism, and the second is a simple, position-wise fully connected feed-forward network. We employ a residual connection around each of the two sub-layers, followed by layer normalization.

Similarly to other sequence transduction models, we use learned embeddings to convert the input tokens and output tokens to vectors of dimension d_model. We also use the usual learned linear transformation and softmax function to convert the decoder output to predicted next-token probabilities. In our model, we share the same weight matrix between the two embedding layers and the pre-softmax linear transformation.

Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions. With a single attention head, averaging inhibits this. We found it beneficial to linearly project the queries, keys and values h times with different, learned linear projections.

We apply three kinds of multi-head attention in the architecture. In encoder-decoder attention, the queries come from the previous decoder layer, and the memory keys and values come from the output of the encoder. This allows every position in the decoder to attend over all positions in the input sequence. The encoder contains self-attention layers in which all of the keys, values and queries come from the same place. Finally, the decoder also uses self-attention, masked to prevent positions from attending to subsequent positions.`

const BITTER_LESSON = `The biggest lesson that can be read from 70 years of AI research is that general methods that leverage computation are ultimately the most effective, and by a large margin. This is a bitter lesson directly. The sad but hopeful news is that the bitter lesson is so important, yet so hard to learn.

Researchers repeatedly invent ways to encode human knowledge into their systems, and these always help in the short term and satisfy the researcher's ego, but in the long run they plateau and inhibit further progress. Breakthrough progress eventually comes from approaches based on scaling computation by search and learning.

One thing that should be learned from the bitter lesson is the great power of general purpose methods, methods that continue to scale with increased computation even as the available computation becomes very great. The two methods that scale arbitrarily in this way are search and learning.`

const DEEP_WORK_CONTENT = `Deep work is professional activity performed in a state of distraction-free concentration that pushes your cognitive capabilities to their limit. These efforts create new value, improve your skill, and are hard to replicate.

The ability to perform deep work is becoming increasingly rare at exactly the same time it is becoming increasingly valuable in our economy. As a consequence, the few who cultivate this skill, and then make it the core of their working life, will thrive.

The Deep Work Hypothesis: The ability to perform deep work is becoming increasingly rare at exactly the same time it is becoming increasingly valuable. Those who will thrive are of three types: high-skill workers, superstars, and those with capital.

To embrace deep work you must decide on a depth philosophy: the monastery, the bimodal, the rhythmic, or the journalistic approach. Ritualize the depth: decide where you'll work and for how long, how you'll work, and how you'll support your work. Make grand gestures. Don't work alone. Work like the famous business theorist whose open door hides a closed door behind it.`

async function main() {
  console.log('Seeding Cortex demo data…')

  // wipe
  await db.reviewLog.deleteMany()
  await db.flashcard.deleteMany()
  await db.focusSession.deleteMany()
  await db.readingSession.deleteMany()
  await db.chatMessage.deleteMany()
  await db.highlight.deleteMany()
  await db.task.deleteMany()
  await db.plan.deleteMany()
  await db.milestone.deleteMany()
  await db.opportunity.deleteMany()
  await db.newsArticle.deleteMany()
  await db.customSource.deleteMany()
  await db.mindMap.deleteMany()
  await db.note.deleteMany()
  await db.document.deleteMany()
  await db.goal.deleteMany()
  await db.setting.deleteMany()

  await db.setting.create({ data: { id: 'user', name: 'Alex', digestTime: '08:00' } })

  // ── Documents ──
  const transformer = await db.document.create({
    data: {
      title: 'Attention Is All You Need',
      author: 'Vaswani et al.',
      type: 'paper',
      source: 'https://arxiv.org/abs/1706.03762',
      status: 'reading',
      progress: 65,
      tags: 'transformers, attention, research',
      content: TRANSFORMER_CONTENT,
      summary:
        'The foundational Transformer paper replaces recurrence with pure self-attention, enabling massively parallel training. It sets new state-of-the-art BLEU scores on WMT 2014 translation for English→German and English→French with a fraction of the training cost.',
      takeaways: JSON.stringify([
        'Self-attention alone (no recurrence) is sufficient for sequence transduction.',
        'Multi-head attention lets the model attend to different representation subspaces jointly.',
        'Positional encodings inject order information that attention lacks by itself.',
        'Training is far faster: 3.5 days on 8 GPUs vs weeks for prior SOTA.',
      ]),
      lastReadAt: new Date(),
    },
  })

  const bitterLesson = await db.document.create({
    data: {
      title: 'The Bitter Lesson',
      author: 'Rich Sutton',
      type: 'article',
      status: 'finished',
      progress: 100,
      tags: 'ai, strategy, scaling',
      content: BITTER_LESSON,
      summary:
        'Sutton argues that general methods leveraging computation — search and learning — beat human-knowledge-encoded approaches over the long run. A sobering read for anyone building AI systems.',
      takeaways: JSON.stringify([
        'Human-knowledge encoding wins short-term but plateaus.',
        'Scaling computation via search & learning is the only unbounded lever.',
      ]),
      lastReadAt: daysAgo(2),
    },
  })

  const deepWork = await db.document.create({
    data: {
      title: 'Deep Work',
      author: 'Cal Newport',
      type: 'book',
      status: 'reading',
      progress: 40,
      tags: 'productivity, focus',
      content: DEEP_WORK_CONTENT,
      summary:
        'Newport makes the case that distraction-free concentration is the superpower of the modern economy, then gives rituals and philosophies (monastic, bimodal, rhythmic, journalistic) to cultivate it.',
      takeaways: JSON.stringify([
        'Rhythmic scheduling beats waiting for inspiration.',
        'Grand gestures and hard deadlines protect depth.',
      ]),
      lastReadAt: daysAgo(1),
    },
  })

  await db.document.create({
    data: {
      title: 'Scaling Laws for Neural Language Models',
      author: 'Kaplan et al.',
      type: 'paper',
      source: 'https://arxiv.org/abs/2001.08361',
      status: 'queued',
      progress: 0,
      tags: 'scaling, llm, research',
    },
  })

  // ── Highlights ──
  const h1 = await db.highlight.create({
    data: {
      documentId: transformer.id,
      text: 'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.',
      color: 'yellow',
      position: 8,
    },
  })
  await db.highlight.create({
    data: {
      documentId: transformer.id,
      text: 'Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions.',
      color: 'green',
      note: 'Core intuition for why heads specialize.',
      position: 480,
    },
  })
  await db.highlight.create({
    data: {
      documentId: deepWork.id,
      text: 'Deep work is professional activity performed in a state of distraction-free concentration that pushes your cognitive capabilities to their limit.',
      color: 'blue',
      position: 0,
    },
  })

  // ── Flashcards ──
  const fc1 = await db.flashcard.create({
    data: {
      front: 'What does the Transformer remove entirely compared to prior sequence transduction models?',
      back: 'Recurrence and convolutions — it relies solely on (self-)attention mechanisms.',
      documentId: transformer.id,
      highlightId: h1.id,
      dueAt: daysAgo(0, 1), // due 1h ago
    },
  })
  await db.flashcard.create({
    data: {
      front: 'Why multi-head attention instead of a single attention head?',
      back: 'It lets the model jointly attend to information from different representation subspaces at different positions; a single head averages and inhibits this.',
      documentId: transformer.id,
      dueAt: daysAhead(2),
      repetitions: 1,
      interval: 2,
      ease: 2.6,
    },
  })
  await db.flashcard.create({
    data: {
      front: 'What is the Bitter Lesson in one sentence?',
      back: 'General methods that leverage computation (search and learning) ultimately beat approaches built on hand-encoded human knowledge.',
      documentId: bitterLesson.id,
      dueAt: daysAgo(0, 2), // due 2h ago
    },
  })
  await db.reviewLog.create({ data: { flashcardId: fc1.id, grade: 'good', reviewedAt: daysAgo(3) } })

  // ── Goals with milestones ──
  const internshipGoal = await db.goal.create({
    data: {
      title: 'Land a 2027 summer AI internship',
      description: 'Target: top research labs and AI-native startups. 20 tailored applications, 3 mock interviews.',
      category: 'career',
      color: 'indigo',
      deadline: daysAhead(45),
      streak: 2,
      lastCompletedAt: daysAgo(1),
      milestones: {
        create: [
          { title: 'Polish resume + portfolio site', done: true, order: 0, completedAt: daysAgo(2) },
          { title: 'Shortlist 20 target companies', done: true, order: 1, completedAt: daysAgo(1) },
          { title: 'Tailor applications (first 10)', done: false, order: 2, dueDate: daysAhead(7) },
          { title: '30 LeetCode + 3 mock interviews', done: false, order: 3, dueDate: daysAhead(21) },
          { title: 'Send follow-ups & compare offers', done: false, order: 4 },
        ],
      },
    },
    include: { milestones: true },
  })

  const papersGoal = await db.goal.create({
    data: {
      title: 'Read 12 research papers this quarter',
      category: 'learning',
      color: 'teal',
      deadline: daysAhead(60),
      streak: 0,
      milestones: {
        create: [
          { title: 'Build the backlog on arXiv', done: true, order: 0, completedAt: daysAgo(5) },
          { title: 'Weekly deep-read ritual (4/12)', done: false, order: 1 },
          { title: 'Flashcards for every paper', done: false, order: 2 },
          { title: 'Write weekly reading notes', done: false, order: 3 },
        ],
      },
    },
    include: { milestones: true },
  })

  await db.goal.create({
    data: {
      title: 'Ship portfolio v2',
      description: 'Redesign with case studies; deploy before applications ramp up.',
      category: 'project',
      color: 'amber',
      deadline: daysAhead(9),
      streak: 0,
      milestones: {
        create: [
          { title: 'Pick template + palette', done: false, order: 0 },
          { title: 'Write 3 case studies', done: false, order: 1 },
          { title: 'Deploy + custom domain', done: false, order: 2 },
        ],
      },
    },
  })

  // ── Plans (nested) ──
  const year = await db.plan.create({
    data: { title: '2026 — Growth year', timeframe: 'year', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
  })
  const month = await db.plan.create({
    data: { title: 'September — application sprint', timeframe: 'month', parentId: year.id, goalId: internshipGoal.id },
  })
  const week = await db.plan.create({
    data: { title: 'Week 36 — foundations', timeframe: 'week', parentId: month.id, goalId: internshipGoal.id, notes: 'Ship the resume tailoring pipeline.' },
  })
  const day = await db.plan.create({
    data: { title: 'Today — deep work block', timeframe: 'day', parentId: week.id, startDate: todayAt(8), endDate: todayAt(20) },
  })

  // ── Tasks ──
  await db.task.create({
    data: { title: 'Tailor resume for Anthropic research intern', priority: 'high', dueDate: todayAt(11), estimate: 45, goalId: internshipGoal.id, planId: day.id },
  })
  await db.task.create({
    data: { title: 'Finish reading Attention paper §3.2', priority: 'med', dueDate: todayAt(15), estimate: 30, goalId: papersGoal.id, planId: day.id },
  })
  await db.task.create({
    data: { title: 'Review due flashcards', priority: 'med', dueDate: todayAt(19), estimate: 15, planId: day.id },
  })
  await db.task.create({
    data: { title: 'Write weekly review note', priority: 'low', dueDate: daysAhead(2), estimate: 20, planId: week.id },
  })
  await db.task.create({
    data: { title: 'Buy domain for portfolio', priority: 'low', dueDate: daysAgo(1), estimate: 10 },
  })
  // done tasks (analytics)
  await db.task.create({
    data: { title: 'Update resume with Cortex project', status: 'done', completedAt: daysAgo(1), estimate: 30, goalId: internshipGoal.id },
  })
  await db.task.create({
    data: { title: 'Deep-read The Bitter Lesson', status: 'done', completedAt: daysAgo(2), estimate: 25, goalId: papersGoal.id },
  })
  await db.task.create({
    data: { title: 'Shortlist top 5 labs', status: 'done', completedAt: daysAgo(1), estimate: 20, goalId: internshipGoal.id },
  })

  // ── News ──
  const news = [
    { title: 'OpenAI unveils new o-series reasoning models with 10× cheaper inference', source: 'openai.com', category: 'company', summary: 'OpenAI shipped a new o-series with adaptive reasoning depth.\nCost per token drops 10× for routine queries.\nDevelopers get automatic routing between fast and deep modes.', publishedAt: daysAgo(0, -3) },
    { title: 'Anthropic publishes constitutional AI alignment progress report', source: 'anthropic.com', category: 'company', summary: 'Anthropic details the latest constitutional training pipeline.\nRefusals drop 40% while safety evals hold steady.\nThe report includes the full constitution text for public review.', publishedAt: daysAgo(0, -5) },
    { title: 'DeepMind AlphaFold 4 predicts protein-RNA complexes', source: 'deepmind.google', category: 'lab', summary: 'AlphaFold 4 extends structure prediction to protein-RNA binding.\nWet-lab partners validate 78% of new predictions.\nFree tier expands to 500 predictions/day for researchers.', publishedAt: daysAgo(1) },
    { title: 'arXiv: Sparse Mixture-of-Experts reaches 1T params on 512 GPUs', source: 'arxiv.org', category: 'research', summary: 'New MoE routing scheme cuts expert imbalance by 6×.\n1T-parameter model trains at dense-70B cost.\nCode and checkpoints promised for next month.', publishedAt: daysAgo(1) },
    { title: 'Mistral releases open-weight 8B coding model under Apache 2.0', source: 'mistral.ai', category: 'company', summary: 'Mistral Codestral-8B rivals closed models on HumanEval.\nApache 2.0 license allows commercial use.\nRuns on a single consumer GPU at 90 tok/s.', publishedAt: daysAgo(2) },
    { title: 'The Batch: multimodal agents go mainstream', source: 'deeplearning.ai', category: 'newsletter', summary: 'Andrew Ng covers agentic workflows with vision+tools.\nFeatured: a beginner project building a document-QA agent.\nPractical tip: evals before scale, always.', publishedAt: daysAgo(2) },
    { title: 'Import AI #412: world models, robot policies and the compute divide', source: 'jack-clark.net', category: 'newsletter', summary: 'Jack Clark surveys world-model research for robotics.\nCompute access gap between academia and industry widens.\nQuote of the week: "data is the new architecture".', publishedAt: daysAgo(3) },
    { title: 'Hugging Face releases open evaluation leaderboard v3', source: 'huggingface.co', category: 'company', summary: 'Leaderboard v3 adds contamination checks per benchmark.\nCommunity votes weight new eval suites.\nPrivate org dashboards are now free for academics.', publishedAt: daysAgo(3) },
    { title: 'Meta FAIR: self-supervised speech model beats whisper on low-resource languages', source: 'ai.meta.com', category: 'lab', summary: 'New SSL recipe covers 1,100 languages.\n35% WER reduction on languages with <10h data.\nModels released under permissive research license.', publishedAt: daysAgo(4) },
    { title: 'TLDR AI: NVIDIA teases next-gen inference chip', source: 'tldr.tech', category: 'newsletter', summary: 'NVIDIA hints at 2× inference throughput silicon.\nTLDR also covers a debate on synthetic data limits.\nQuick hits: 5 funding rounds over $100M.', publishedAt: daysAgo(4) },
  ]
  for (const n of news) {
    await db.newsArticle.create({ data: { ...n, url: `https://${n.source}/articles/${encodeURIComponent(n.title.slice(0, 40))}` } })
  }

  await db.customSource.create({ data: { name: 'Simon Willison', url: 'https://simonwillison.net', type: 'blog' } })
  await db.customSource.create({ data: { name: 'Latent Space', url: 'https://www.latent.space', type: 'newsletter' } })

  // ── Opportunities ──
  await db.opportunity.create({
    data: {
      company: 'Google DeepMind', role: 'Research Intern — Summer 2027', type: 'internship', status: 'applied',
      classification: 'deadline', source: 'Gmail (pasted)', sender: 'careers@deepmind.google',
      deadline: daysAhead(3), nextAction: 'Prep for screening call', resume: 'resume-alex-swe-v3.pdf',
      notes: 'Applied via referral. Screening call scheduled.',
    },
  })
  await db.opportunity.create({
    data: {
      company: 'Anthropic', role: 'Software Engineering Intern', type: 'internship', status: 'saved',
      classification: 'opportunity', source: 'Gmail (pasted)', sender: 'recruiting@anthropic.com',
      deadline: daysAhead(12), nextAction: 'Tailor resume tonight', resume: 'resume-alex-swe-v3.pdf',
      notes: 'Strong alignment with Cortex project.',
    },
  })
  await db.opportunity.create({
    data: {
      company: 'Meta AI (FAIR)', role: 'Research Engineer Intern', type: 'internship', status: 'interview',
      classification: 'interview', source: 'Gmail (pasted)', sender: 'fairext@meta.com',
      deadline: daysAhead(6), nextAction: 'Technical interview Thursday',
      notes: 'Round 2: coding + research discussion.',
    },
  })
  await db.opportunity.create({
    data: {
      company: 'A16z-backed startup (Stealth)', role: 'Full-stack Intern', type: 'internship', status: 'rejected',
      classification: 'rejection', source: 'Gmail (pasted)', sender: 'talent@stealth.ai',
      notes: 'Rejected — they wanted senior-level React experience.',
    },
  })

  // ── Mindmap ──
  await db.mindMap.create({
    data: {
      title: 'Attention Is All You Need',
      nodes: JSON.stringify([
        { id: 'n1', label: 'Transformer', x: 120, y: 200, parentId: null, color: 'indigo' },
        { id: 'n2', label: 'Self-attention', x: 380, y: 80, parentId: 'n1', color: 'teal' },
        { id: 'n3', label: 'Multi-head (8 heads)', x: 640, y: 40, parentId: 'n2', color: 'zinc' },
        { id: 'n4', label: 'Scaled dot-product', x: 640, y: 130, parentId: 'n2', color: 'zinc' },
        { id: 'n5', label: 'Positional encoding', x: 380, y: 210, parentId: 'n1', color: 'amber' },
        { id: 'n6', label: 'Encoder stack ×6', x: 380, y: 320, parentId: 'n1', color: 'violet' },
        { id: 'n7', label: 'FFN + residual + norm', x: 640, y: 360, parentId: 'n6', color: 'zinc' },
      ]),
    },
  })

  // ── Notes ──
  await db.note.create({
    data: { title: 'Interview questions to prepare', content: '1. Explain attention to a PM.\n2. How would you scale eval infrastructure?\n3. STAR story: shipping under ambiguity.', source: 'capture' },
  })
  await db.note.create({
    data: { title: 'Voice memo — commute idea', content: 'Idea: use the copilot to auto-draft weekly review from completed tasks and reading sessions…', source: 'voice' },
  })

  // ── Reading sessions (last 7 days) ──
  const reading = [
    { docId: transformer.id, d: 0, m: 25 },
    { docId: deepWork.id, d: 0, m: 10 },
    { docId: transformer.id, d: 1, m: 30 },
    { docId: deepWork.id, d: 2, m: 20 },
    { docId: bitterLesson.id, d: 2, m: 15 },
    { docId: transformer.id, d: 3, m: 35 },
    { docId: bitterLesson.id, d: 4, m: 25 },
    { docId: deepWork.id, d: 5, m: 18 },
  ]
  for (const r of reading) {
    const day = daysAgo(r.d)
    day.setHours(0, 0, 0, 0)
    await db.readingSession.create({ data: { documentId: r.docId, minutes: r.m, day } })
  }

  // ── Focus sessions ──
  await db.focusSession.create({ data: { goalId: internshipGoal.id, minutes: 50, startedAt: todayAt(9), endedAt: todayAt(10) } })
  await db.focusSession.create({ data: { minutes: 25, startedAt: daysAgo(1, 10), endedAt: daysAgo(1, 11) } })
  await db.focusSession.create({ data: { minutes: 50, startedAt: daysAgo(2, 9), endedAt: daysAgo(2, 10) } })

  console.log('Seed complete ✔')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
