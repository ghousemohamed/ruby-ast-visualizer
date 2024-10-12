import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';

import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-ruby';
import 'prismjs/themes/prism.css';

function createTreeLayout(nodes, edges) {
  const nodeMap = new Map(nodes.map(node => [node.id, { ...node, children: [] }]));
  edges.forEach(edge => {
    const parent = nodeMap.get(edge.source);
    const child = nodeMap.get(edge.target);
    if (parent && child) {
      parent.children.push(child);
    }
  });

  const root = nodes.find(node => !edges.some(edge => edge.target === node.id));
  if (!root) return nodes;

  const nodeWidth = 120;
  const nodeHeight = 40;
  const horizontalSpacing = 50;
  const verticalSpacing = 80;

  function calculateSubtreeWidth(node) {
    if (node.children.length === 0) return nodeWidth;
    const childrenWidth = node.children.map(calculateSubtreeWidth).reduce((a, b) => a + b, 0);
    return Math.max(nodeWidth, childrenWidth + (node.children.length - 1) * horizontalSpacing);
  }

  function positionNode(node, x, y, level) {
    node.position = { x, y: level * (nodeHeight + verticalSpacing) };
    const subtreeWidth = calculateSubtreeWidth(node);
    let childX = x - (subtreeWidth - nodeWidth) / 2;
    node.children.forEach(child => {
      const childSubtreeWidth = calculateSubtreeWidth(child);
      positionNode(child, childX + childSubtreeWidth / 2, y + nodeHeight + verticalSpacing, level + 1);
      childX += childSubtreeWidth + horizontalSpacing;
    });
  }

  const rootNode = nodeMap.get(root.id);
  positionNode(rootNode, 0, 0, 0);

  return Array.from(nodeMap.values());
}

function parseAst(ast) {
  let nodes = [];
  let edges = [];
  let counters = {};

  function getUniqueId(type) {
    if (!counters[type]) {
      counters[type] = 0;
    }
    counters[type]++;
    return `${type}_${counters[type]}`;
  }

  function getNodeLabel(node) {
    if (typeof node === 'object' && node !== null) {
      if (node.type) {
        if (typeof node.value === 'string') {
          return `${node.type}: "${node.value}"`;
        } else {
          return node.type;
        }
      } else {
        if (Array.isArray(node)) {
          return "optionals"
        } else {
          return JSON.stringify(node);
        }
      }
    }
    return String(node);
  }

  function processNode(node, parentId = null) {
    if (typeof node !== 'object' || node === null) {
      return;
    }

    const nodeId = getUniqueId(node.type || 'unnamed');
    
    if (node.type !== null) {
      nodes.push({
        id: nodeId,
        type: 'default',
        data: { 
          label: getNodeLabel(node),
          astNode: node,
        },
        position: { x: 0, y: 0 },
      });
    }

    if (parentId) {
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'smoothstep',
      });
    }

    for (let key in node) {
      if (node.hasOwnProperty(key)) {
        if (Array.isArray(node[key])) {
          node[key].forEach((item) => processNode(item, nodeId));
        } else if (typeof node[key] === 'object' && node[key] !== null) {
          processNode(node[key], nodeId);
        }
      }
    }
  }

  processNode(ast);
  return { nodes, edges };
}

function App() {
  const [rubyCode, setRubyCode] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedRange, setSelectedRange] = useState(null);
  const [key, setKey] = useState(0);
  const [selectedNode, setSelectedNode] = useState(null);
  const nodesRef = useRef([]);

  const handleEditorChange = useCallback((code) => {
    setRubyCode(code);
  }, []);

  const handleRenderAst = async () => {
    try {
      const response = await fetch(process.env.PARSE_URL || 'http://localhost:4000/parse' || 'https://server.ruby-ast-visualizer.net/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: rubyCode }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const ast = await response.json();
      let { nodes: parsedNodes, edges: parsedEdges } = parseAst(ast);
      parsedNodes = createTreeLayout(parsedNodes, parsedEdges);
      setNodes(parsedNodes);
      setEdges(parsedEdges);
      nodesRef.current = parsedNodes;
    } catch (error) {
      console.error('Failed to parse AST:', error);
      alert('Failed to parse AST. Please check your input and ensure the server is running.');
    }
  };

  const handleNodeClick = useCallback((event, node) => {
    const astNode = node.data.astNode;
    if (astNode && astNode.location) {
      const [start_line, start_column, end_line, end_column] = astNode.location;
      setSelectedRange({ start_line, start_column, end_line, end_column });
      setKey(prevKey => prevKey + 1);
    }
  }, []);

  const highlightCode = (code) => {
    if (!selectedRange) return highlight(code, languages.ruby);

    const { start_line, start_column, end_line, end_column } = selectedRange;
    const lines = code.split('\n');

    let charCount = 0;
    return lines.map((line, i) => {
      const lineNum = i + 1;
      const lineLength = line.length + 1;

      const lineStartChar = charCount;
      const lineEndChar = charCount + lineLength;
      charCount = lineEndChar;

      if (lineNum < start_line || lineNum > end_line) {
        return highlight(line, languages.ruby) + '\n';
      }

      let startIdx = Math.max(0, start_line === lineNum ? start_column - lineStartChar : 0);
      let endIdx = end_line === lineNum ? end_column - lineStartChar : lineLength - 1;

      const beforeHighlight = line.slice(0, startIdx);
      const highlightedPart = line.slice(startIdx, endIdx);
      const afterHighlight = line.slice(endIdx);

      return (
        highlight(beforeHighlight, languages.ruby) +
        `<span class="highlight">${highlight(highlightedPart, languages.ruby)}</span>` +
        highlight(afterHighlight, languages.ruby) +
        '\n'
      );
    }).join('');
  };

  useEffect(() => {
    setKey(prevKey => prevKey + 1);
  }, [selectedRange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      <header style={{ backgroundColor: '#8B0000', color: 'white', textAlign: 'center' }}>
        <h1>Ruby AST Visualizer</h1>
      </header>
      <div style={{ display: 'flex', flex: 1 }}>
        <div style={{ width: '30%', padding: '20px', borderRight: '1px solid #ccc', backgroundColor: 'white' }}>
          <h2>Ruby Code Input</h2>
          <Editor
            key={key}
            value={rubyCode}
            onValueChange={handleEditorChange}
            highlight={highlightCode}
            padding={10}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 12,
              backgroundColor: '#f5f5f5',
              height: '300px',
              overflow: 'auto',
            }}
          />
          <button onClick={handleRenderAst} style={{ marginTop: '10px' }}>Render AST</button>
        </div>
        <div style={{ width: '70%', height: '100%' }}>
          <ReactFlow
            nodes={nodes.map(node => ({
              ...node,
              style: {
                ...node.style,
                backgroundColor: node === selectedNode ? '#FFFFE0' : '#ffffff',
              },
            }))}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.1}
            maxZoom={2}
            defaultZoom={0.5}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export default App;
