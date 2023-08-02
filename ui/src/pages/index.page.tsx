import { useEffect, useState } from 'react';
import './reactCOIServiceWorker';
import ZkappWorkerClient from './zkappWorkerClient';
import { PublicKey, Field } from 'snarkyjs';
import GradientBG from '../components/GradientBG.js';
import styles from '../styles/Home.module.css';

let transactionFee = 0.1;

export default function Home() {
  const [state, setState] = useState({
    zkappWorkerClient: null as null | ZkappWorkerClient,
    hasWallet: null as null | boolean,
    hasBeenSetup: false,
    accountExists: false,
    currentNum: null as null | Field,
    publicKey: null as null | PublicKey,
    zkappPublicKey: null as null | PublicKey,
    creatingTransaction: false,
  });

  const [displayText, setDisplayText] = useState('');
  const [transactionlink, setTransactionLink] = useState('');

  // -------------------------------------------------------
  // Do Setup

  useEffect(() => {
    async function timeout(seconds: number): Promise<void> {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, seconds * 1000);
      });
    }

    (async () => {
      if (!state.hasBeenSetup) {
        setDisplayText('Loading web worker...');
        console.log('Loading web worker...');
        const zkappWorkerClient = new ZkappWorkerClient();
        await timeout(5);

        setDisplayText('Done loading web worker');
        console.log('Done loading web worker');

        await zkappWorkerClient.setActiveInstanceToBerkeley();

        const mina = (window as any).mina;

        if (mina == null) {
          setState({ ...state, hasWallet: false });
          return;
        }

        const publicKeyBase58: string = (await mina.requestAccounts())[0];
        const publicKey = PublicKey.fromBase58(publicKeyBase58);

        console.log(`Using key:${publicKey.toBase58()}`);
        setDisplayText(`Using key:${publicKey.toBase58()}`);

        setDisplayText('Checking if fee payer account exists...');
        console.log('Checking if fee payer account exists...');

        const res = await zkappWorkerClient.fetchAccount({
          publicKey: publicKey!,
        });
        const accountExists = res.error == null;

        await zkappWorkerClient.loadContract();

        console.log('Compiling zkApp...');
        setDisplayText('Compiling zkApp...');
        await zkappWorkerClient.compileContract();
        console.log('zkApp compiled');
        setDisplayText('zkApp compiled...');

        const zkappPublicKey = PublicKey.fromBase58(
          'B62qjshG3cddKthD6KjCzHZP4oJM2kGuC8qRHN3WZmKH5B74V9Uddwu'
        );

        await zkappWorkerClient.initZkappInstance(zkappPublicKey);

        console.log('Getting zkApp state...');
        setDisplayText('Getting zkApp state...');
        await zkappWorkerClient.fetchAccount({ publicKey: zkappPublicKey });
        const currentNum = await zkappWorkerClient.getNum();
        console.log(`Current state in zkApp: ${currentNum.toString()}`);
        setDisplayText('');

        setState({
          ...state,
          zkappWorkerClient,
          hasWallet: true,
          hasBeenSetup: true,
          publicKey,
          zkappPublicKey,
          accountExists,
          currentNum,
        });
      }
    })();
  }, []);

  // -------------------------------------------------------
  // Wait for account to exist, if it didn't

  useEffect(() => {
    (async () => {
      if (state.hasBeenSetup && !state.accountExists) {
        for (;;) {
          setDisplayText('Checking if fee payer account exists...');
          console.log('Checking if fee payer account exists...');
          const res = await state.zkappWorkerClient!.fetchAccount({
            publicKey: state.publicKey!,
          });
          const accountExists = res.error == null;
          if (accountExists) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        setState({ ...state, accountExists: true });
      }
    })();
  }, [state.hasBeenSetup]);

  // -------------------------------------------------------
  // Send a transaction

  const onSendTransaction = async () => {
    setState({ ...state, creatingTransaction: true });

    setDisplayText('Creating a transaction...');
    console.log('Creating a transaction...');

    await state.zkappWorkerClient!.fetchAccount({
      publicKey: state.publicKey!,
    });

    await state.zkappWorkerClient!.createUpdateTransaction();

    setDisplayText('Creating proof...');
    console.log('Creating proof...');
    await state.zkappWorkerClient!.proveUpdateTransaction();

    console.log('Requesting send transaction...');
    setDisplayText('Requesting send transaction...');
    const transactionJSON = await state.zkappWorkerClient!.getTransactionJSON();

    setDisplayText('Getting transaction JSON...');
    console.log('Getting transaction JSON...');
    const { hash } = await (window as any).mina.sendTransaction({
      transaction: transactionJSON,
      feePayer: {
        fee: transactionFee,
        memo: '',
      },
    });

    const transactionLink = `https://berkeley.minaexplorer.com/transaction/${hash}`;
    console.log(`View transaction at ${transactionLink}`);

    setTransactionLink(transactionLink);
    setDisplayText(transactionLink);

    setState({ ...state, creatingTransaction: false });
  };

  // -------------------------------------------------------
  // Refresh the current state

  const onRefreshCurrentNum = async () => {
    console.log('Getting zkApp state...');
    setDisplayText('Getting zkApp state...');

    await state.zkappWorkerClient!.fetchAccount({
      publicKey: state.zkappPublicKey!,
    });
    const currentNum = await state.zkappWorkerClient!.getNum();
    setState({ ...state, currentNum });
    console.log(`Current state in zkApp: ${currentNum.toString()}`);
    setDisplayText('');
  };

  // -------------------------------------------------------
  // Create UI elements

  let hasWallet;
  if (state.hasWallet != null && !state.hasWallet) {
    const auroLink = 'https://www.aurowallet.com/';
    const auroLinkElem = (
      <a href={auroLink} target="_blank" rel="noreferrer">
        Install Auro wallet here
      </a>
    );
    hasWallet = (
      <div>
        Could not find a wallet. {auroLinkElem}
      </div>
    );
  }

  const stepDisplay = transactionlink ? (
    <a href={displayText} target="_blank" rel="noreferrer">
      View transaction
    </a>
  ) : (
    displayText
  );

  let setup = (
    <div
      className={styles.start}
      style={{ fontWeight: 'bold', fontSize: '1.5rem', paddingBottom: '5rem' }}
    >
      {stepDisplay}
      {hasWallet}
    </div>
  );

  let accountDoesNotExist;
  if (state.hasBeenSetup && !state.accountExists) {
    const faucetLink =
      'https://faucet.minaprotocol.com/?address=' + state.publicKey!.toBase58();
    accountDoesNotExist = (
      <div>
        Account does not exist. 
        <a href={faucetLink} target="_blank" rel="noreferrer">
           Visit the faucet to fund this fee payer account
        </a>
      </div>
    );
  }

  let mainContent;
  if (state.hasBeenSetup && state.accountExists) {
    type InputType = 'text' | 'number' | 'password' | 'email' | 'date' | 'color' | 'datetime-local' | 'month' | 'range' | 'search' | 'tel' | 'time' | 'url' | 'week';
    interface InputField {
      type: InputType;
      placeholder: string;
    }
    interface ButtonRowProps {
      buttonName: string;
      onClick: (inputValues: string[]) => void;
      inputFields?: InputField[];
    }
    const ButtonRow: React.FC<ButtonRowProps> = ({ buttonName, onClick, inputFields = [] }) => {
      const [inputValues, setInputValues] = useState<string[]>(Array(inputFields.length).fill(''));
      const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const newInputValues = [...inputValues];
        newInputValues[index] = event.target.value;
        setInputValues(newInputValues);
      };
      const handleClick = () => {
        onClick(inputValues);
        setInputValues(Array(inputFields.length).fill(''));
      };
      return (
        <div className={styles.row}>
          <button
            className={styles.card}
            onClick={handleClick}
            disabled={state.creatingTransaction}
          >
            {buttonName}
          </button>
          {inputFields.map((field, index) => (
            <input
              key={index}
              className={styles.input}
              type={field.type}
              placeholder={field.placeholder}
              value={inputValues[index]}
              onChange={(event) => handleInputChange(event, index)}
            />
          ))}
        </div>
      );
    };    

    mainContent = (
      <div style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className={styles.center} style={{ padding: 0 }}>
          Read Contract
        </div>
        <ButtonRow buttonName="getContract" onClick={onSendTransaction} inputFields={[{ type: 'number', placeholder: 'contractId' }]} />
        
        <div style={{ height: '3rem' }}></div>
        <div className={styles.center} style={{ padding: 0 }}>
          Write Contract
        </div>
        <ButtonRow buttonName="newContract" onClick={onSendTransaction} inputFields={[{ type: 'text', placeholder: 'receiver' }, { type: 'number', placeholder: 'hashlock' }, { type: 'number', placeholder: 'timelock' }, { type: 'text', placeholder: 'tokenContract' }, { type: 'number', placeholder: 'amount' }]} />
        <ButtonRow buttonName="withdraw" onClick={onSendTransaction} inputFields={[{ type: 'number', placeholder: 'contractId' }, { type: 'number', placeholder: 'preimage' }]} />
        <ButtonRow buttonName="refund" onClick={onSendTransaction} inputFields={[{ type: 'number', placeholder: 'contractId' }]} />
        <div style={{ height: '3rem' }}></div>
      </div>
    );
  }

  return (
    <GradientBG>
      <div className={styles.main} style={{ padding: 0 }}>
        <div className={styles.center} style={{ padding: 0 }}>
          {setup}
          {accountDoesNotExist}
          {mainContent}
        </div>
      </div>
    </GradientBG>
  );
}
