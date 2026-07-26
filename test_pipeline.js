import dotenv from 'dotenv';
import { db } from './src/db/prisma.js';
import { executeResearchGraph } from './src/agents/researchGraph.js';

dotenv.config();

async function runTest(query) {
  console.log(`\n==================================================`);
  console.log(`TEST QUERY: "${query}"`);
  console.log(`==================================================`);
  
  try {
    const job = db.job.create({ query, depth: 'standard', academicOnly: false });
    console.log(`Created Job ID: ${job.id}`);
    
    console.log('Running Research Graph Pipeline...');
    const state = await executeResearchGraph(job.id);
    
    const finalJob = db.job.findById(job.id);
    console.log(`Overall Confidence: ${finalJob.overallConfidence}%`);
    console.log(`Hallucination Score: ${finalJob.hallucinationScore}%`);
    console.log(`Status: ${finalJob.status}`);
    
    console.log(`\nExtracted Claims:`);
    finalJob.claims.forEach((c, idx) => {
      console.log(`- Claim ${idx + 1}: [${c.status}] ${c.claimText} (Score: ${c.confidenceScore}%)`);
    });
    
    console.log(`\nReport Snippet:`);
    const lines = finalJob.report.summaryMarkdown.split('\n');
    console.log(lines.slice(0, 15).join('\n'));
    console.log('...\n');
  } catch (err) {
    console.error('Test failed with error:', err);
  }
}

async function runAll() {
  await runTest("What is the capital of France?");
  await runTest("What are India's renewable energy targets for 2030?");
  await runTest("What are the economic risks of AI regulation in India?");
}

runAll();
