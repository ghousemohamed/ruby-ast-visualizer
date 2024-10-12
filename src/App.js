import React, { useState } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';

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

function parseAst(ast, parentId = null) {
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
          return node.type + `: "${node.value}"`;
        } else {
          return node.type;
        }
      } else {
        return Object.entries(node)
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(', ');
      }
    }
    return String(node);
  }

  function processNode(node, parentId) {
    const nodeId = getUniqueId(node.type || 'unnamed');
    
    nodes.push({
      id: nodeId,
      type: 'default',
      data: { label: getNodeLabel(node) },
      position: { x: 0, y: 0 },
    });

    if (parentId) {
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'smoothstep',
      });
    }

    for (let key in node) {
      if (node.hasOwnProperty(key) && typeof node[key] === 'object' && node[key] !== null) {
        if (Array.isArray(node[key])) {
          node[key].forEach((item, index) => {
            if (typeof item === 'object' && item !== null) {
              processNode(item, nodeId);
            }
          });
        } else {
          processNode(node[key], nodeId);
        }
      } else if (key === 'operator' || (typeof node[key] !== 'object' && !node.type)) {
        // Handle simple key-value pairs
        const simpleNodeId = getUniqueId('simple');
        nodes.push({
          id: simpleNodeId,
          type: 'default',
          data: { label: `${key}: ${node[key]}` },
          position: { x: 0, y: 0 },
        });
        edges.push({
          id: `${nodeId}-${simpleNodeId}`,
          source: nodeId,
          target: simpleNodeId,
          type: 'smoothstep',
        });
      }
    }
  }

  if (ast.type === 'program' && ast.statements && ast.statements.body) {
    const programId = getUniqueId('program');
    nodes.push({
      id: programId,
      type: 'default',
      data: { label: 'program' },
      position: { x: 0, y: 0 },
    });
    ast.statements.body.forEach(statement => processNode(statement, programId));
  } else {
    processNode(ast, parentId);
  }

  return { nodes, edges };
}

function App() {
  const [rubyCode, setRubyCode] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const handleRubyCodeChange = (e) => {
    setRubyCode(e.target.value);
  };

  const handleRenderAst = async () => {
    try {
      const response = await fetch(process.env.PARSE_URL || 'https://server.ruby-ast-visualizer.net/parse', {
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
    } catch (error) {
      console.error('Failed to parse AST:', error);
      alert('Failed to parse AST. Please check your input and ensure the server is running.');
    }
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <div style={{ width: '30%', padding: '20px', borderRight: '1px solid #ccc' }}>
        <h2>Ruby Code Input</h2>
        <textarea
          value={rubyCode}
          onChange={handleRubyCodeChange}
          style={{ width: '100%', height: '300px' }}
          placeholder="Enter your Ruby code here..."
        />
        <button onClick={handleRenderAst} style={{ marginTop: '10px' }}>Render AST</button>
      </div>
      <div style={{ width: '70%', height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={2}
          defaultZoom={0.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

export default App;
